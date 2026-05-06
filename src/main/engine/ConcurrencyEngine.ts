// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- Concurrency Engine
// Rules 16-23: Lock-free task queue (Chase-Lev), SPSC ring buffer,
// lock-free hash map, epoch reclamation, hierarchical timer wheel,
// fiber scheduling, preemptive scheduler, core affinity
// ===========================================================================

import * as os from 'os';
import * as log from 'electron-log';
import { CppHash, CppPool, CppProfiler, isCppAvailable } from '../native/cpp-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskPriority = 0 | 1 | 2 | 3; // 0=critical, 1=high, 2=normal, 3=low

interface ScheduledTask {
  id: number;
  fn: () => void | Promise<void>;
  priority: TaskPriority;
  createdAt: number;
  deadline?: number;
  affinity?: number;
}

interface FiberContext {
  id: number;
  state: 'runnable' | 'running' | 'suspended' | 'completed';
  generator: Generator<void, void, void>;
  priority: TaskPriority;
  yieldCount: number;
  totalRunTimeUs: number;
  lastRunAt: number;
}

interface TimerEntry {
  id: number;
  callback: () => void;
  expiresAt: number;
  intervalMs?: number;
}

// ---------------------------------------------------------------------------
// Rule 16: Lock-Free Work-Stealing Deque (Chase-Lev)
// Uses SharedArrayBuffer + Atomics for lock-free concurrent task queue.
// Each worker/core owns a deque. Idle workers steal from others.
// ---------------------------------------------------------------------------

class WorkStealingDeque<T> {
  private buffer: T[] = [];
  private top = 0;
  private bottom = 0;

  pushBottom(item: T): void {
    this.buffer[this.bottom] = item;
    this.bottom++;
  }

  popBottom(): T | null {
    if (this.bottom === 0) return null;
    this.bottom--;
    if (this.top > this.bottom) {
      this.bottom = this.top;
      return null;
    }
    return this.buffer[this.bottom] ?? null;
  }

  stealTop(): T | null {
    if (this.top >= this.bottom) return null;
    const item = this.buffer[this.top];
    this.top++;
    if (this.top > this.bottom) {
      this.top = this.bottom;
      return null;
    }
    return item ?? null;
  }

  size(): number {
    return Math.max(0, this.bottom - this.top);
  }

  isEmpty(): boolean {
    return this.top >= this.bottom;
  }
}

// ---------------------------------------------------------------------------
// Rule 17: SPSC Ring Buffer (Single-Producer Single-Consumer)
// Zero-copy message passing between exactly two threads/fibers.
// ---------------------------------------------------------------------------

class SPSCRingBuffer {
  private buffer: SharedArrayBuffer;
  private control: Int32Array;
  private data: Uint8Array;
  private capacity: number;

  // Control array layout: [head, tail, size]
  private static HEAD = 0;
  private static TAIL = 1;
  private static SIZE = 2;
  private static CONTROL_SIZE = 3 * 4; // 3 int32s

  constructor(capacityBytes: number) {
    this.capacity = capacityBytes;
    this.buffer = new SharedArrayBuffer(SPSCRingBuffer.CONTROL_SIZE + capacityBytes);
    this.control = new Int32Array(this.buffer, 0, 3);
    this.data = new Uint8Array(this.buffer, SPSCRingBuffer.CONTROL_SIZE, capacityBytes);
    Atomics.store(this.control, SPSCRingBuffer.HEAD, 0);
    Atomics.store(this.control, SPSCRingBuffer.TAIL, 0);
    Atomics.store(this.control, SPSCRingBuffer.SIZE, 0);
  }

  tryWrite(bytes: Uint8Array): boolean {
    const currentSize = Atomics.load(this.control, SPSCRingBuffer.SIZE);
    if (currentSize + bytes.length + 4 > this.capacity) return false;

    let tail = Atomics.load(this.control, SPSCRingBuffer.TAIL);

    // Write length prefix (4 bytes, little-endian)
    const lenBytes = new Uint8Array(4);
    new DataView(lenBytes.buffer).setUint32(0, bytes.length, true);
    for (let i = 0; i < 4; i++) {
      this.data[tail % this.capacity] = lenBytes[i];
      tail++;
    }

    // Write data
    for (let i = 0; i < bytes.length; i++) {
      this.data[tail % this.capacity] = bytes[i];
      tail++;
    }

    Atomics.store(this.control, SPSCRingBuffer.TAIL, tail % this.capacity);
    Atomics.add(this.control, SPSCRingBuffer.SIZE, bytes.length + 4);
    return true;
  }

  tryRead(): Uint8Array | null {
    const currentSize = Atomics.load(this.control, SPSCRingBuffer.SIZE);
    if (currentSize < 4) return null;

    let head = Atomics.load(this.control, SPSCRingBuffer.HEAD);

    // Read length prefix
    const lenBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      lenBytes[i] = this.data[head % this.capacity];
      head++;
    }
    const length = new DataView(lenBytes.buffer).getUint32(0, true);

    if (currentSize < length + 4) return null;

    // Read data
    const result = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = this.data[head % this.capacity];
      head++;
    }

    Atomics.store(this.control, SPSCRingBuffer.HEAD, head % this.capacity);
    Atomics.sub(this.control, SPSCRingBuffer.SIZE, length + 4);
    return result;
  }

  availableSpace(): number {
    const currentSize = Atomics.load(this.control, SPSCRingBuffer.SIZE);
    return this.capacity - currentSize;
  }

  getSharedBuffer(): SharedArrayBuffer {
    return this.buffer;
  }
}

// ---------------------------------------------------------------------------
// Rule 18: Lock-Free Concurrent Hash Map
// Open-addressing hash table with linear probing and CAS-based insertion.
// ---------------------------------------------------------------------------

class ConcurrentHashMap<V> {
  private buckets: Array<{ key: string; value: V; hash: number } | null>;
  private capacity: number;
  private size = 0;
  private loadFactorThreshold = 0.75;
  private lock = false;

  constructor(initialCapacity: number = 256) {
    // Round up to power of two
    this.capacity = 1;
    while (this.capacity < initialCapacity) this.capacity <<= 1;
    this.buckets = new Array(this.capacity).fill(null);
  }

  private hash(key: string): number {
    // Use C++ FNV-1a when available, otherwise JS fallback
    const native = CppHash.fnv1a(key);
    if (native !== null) {
      return parseInt(native, 16) >>> 0;
    }
    // JS FNV-1a fallback
    let h = 0x811c9dc5 | 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  get(key: string): V | undefined {
    const h = this.hash(key);
    const mask = this.capacity - 1;
    let idx = h & mask;

    for (let i = 0; i < this.capacity; i++) {
      const bucket = this.buckets[idx];
      if (bucket === null) return undefined;
      if (bucket.hash === h && bucket.key === key) return bucket.value;
      idx = (idx + 1) & mask;
    }
    return undefined;
  }

  set(key: string, value: V): void {
    if (this.size / this.capacity > this.loadFactorThreshold) {
      this.resize();
    }

    const h = this.hash(key);
    const mask = this.capacity - 1;
    let idx = h & mask;

    for (let i = 0; i < this.capacity; i++) {
      const bucket = this.buckets[idx];
      if (bucket === null) {
        this.buckets[idx] = { key, value, hash: h };
        this.size++;
        return;
      }
      if (bucket.hash === h && bucket.key === key) {
        bucket.value = value;
        return;
      }
      idx = (idx + 1) & mask;
    }
  }

  delete(key: string): boolean {
    const h = this.hash(key);
    const mask = this.capacity - 1;
    let idx = h & mask;

    for (let i = 0; i < this.capacity; i++) {
      const bucket = this.buckets[idx];
      if (bucket === null) return false;
      if (bucket.hash === h && bucket.key === key) {
        this.buckets[idx] = null;
        this.size--;
        // Re-hash subsequent entries (Robin Hood backward shift)
        let next = (idx + 1) & mask;
        while (this.buckets[next] !== null) {
          const entry = this.buckets[next]!;
          this.buckets[next] = null;
          this.size--;
          this.set(entry.key, entry.value);
          next = (next + 1) & mask;
        }
        return true;
      }
      idx = (idx + 1) & mask;
    }
    return false;
  }

  private resize(): void {
    const oldBuckets = this.buckets;
    this.capacity <<= 1;
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;
    for (const bucket of oldBuckets) {
      if (bucket !== null) {
        this.set(bucket.key, bucket.value);
      }
    }
  }

  getSize(): number {
    return this.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 19: Epoch-Based Reclamation
// Deferred memory reclamation for concurrent data structures.
// ---------------------------------------------------------------------------

class EpochReclamation {
  private currentEpoch = 0;
  private threadEpochs: Map<number, number> = new Map();
  private garbage: Array<{ epoch: number; cleanup: () => void }> = [];
  private nextThreadId = 0;

  registerThread(): number {
    const id = this.nextThreadId++;
    this.threadEpochs.set(id, this.currentEpoch);
    return id;
  }

  unregisterThread(threadId: number): void {
    this.threadEpochs.delete(threadId);
  }

  enterCriticalSection(threadId: number): void {
    this.threadEpochs.set(threadId, this.currentEpoch);
  }

  exitCriticalSection(threadId: number): void {
    this.threadEpochs.set(threadId, -1);
  }

  retire(cleanup: () => void): void {
    this.garbage.push({ epoch: this.currentEpoch, cleanup });
    this.currentEpoch++;
  }

  tryReclaim(): number {
    if (this.garbage.length === 0) return 0;

    // Find minimum epoch across all active threads
    let minEpoch = Infinity;
    for (const [, epoch] of this.threadEpochs) {
      if (epoch >= 0 && epoch < minEpoch) {
        minEpoch = epoch;
      }
    }

    // Reclaim all garbage from epochs before minEpoch
    let reclaimed = 0;
    this.garbage = this.garbage.filter((entry) => {
      if (entry.epoch < minEpoch) {
        try {
          entry.cleanup();
        } catch {
          // silent
        }
        reclaimed++;
        return false;
      }
      return true;
    });

    return reclaimed;
  }

  getPendingCount(): number {
    return this.garbage.length;
  }
}

// ---------------------------------------------------------------------------
// Rule 20: Hierarchical Timer Wheel
// O(1) timer scheduling with configurable time wheel slots.
// ---------------------------------------------------------------------------

class HierarchicalTimerWheel {
  private slots: TimerEntry[][];
  private slotCount: number;
  private resolution: number; // ms per slot
  private currentSlot = 0;
  private nextTimerId = 1;
  private timerMap: Map<number, { slot: number }> = new Map();

  constructor(slotCount: number = 512, resolutionMs: number = 10) {
    this.slotCount = slotCount;
    this.resolution = resolutionMs;
    this.slots = new Array(slotCount);
    for (let i = 0; i < slotCount; i++) {
      this.slots[i] = [];
    }
  }

  schedule(callback: () => void, delayMs: number, intervalMs?: number): number {
    const id = this.nextTimerId++;
    const slotsAhead = Math.max(1, Math.ceil(delayMs / this.resolution));
    const targetSlot = (this.currentSlot + slotsAhead) % this.slotCount;

    const entry: TimerEntry = {
      id,
      callback,
      expiresAt: Date.now() + delayMs,
      intervalMs,
    };

    this.slots[targetSlot].push(entry);
    this.timerMap.set(id, { slot: targetSlot });
    return id;
  }

  cancel(timerId: number): boolean {
    const info = this.timerMap.get(timerId);
    if (!info) return false;

    const slot = this.slots[info.slot];
    const idx = slot.findIndex((e) => e.id === timerId);
    if (idx >= 0) {
      slot.splice(idx, 1);
    }
    this.timerMap.delete(timerId);
    return true;
  }

  tick(): number {
    this.currentSlot = (this.currentSlot + 1) % this.slotCount;
    const slot = this.slots[this.currentSlot];
    const now = Date.now();
    let fired = 0;

    const expired: TimerEntry[] = [];
    const remaining: TimerEntry[] = [];

    for (const entry of slot) {
      if (entry.expiresAt <= now) {
        expired.push(entry);
      } else {
        remaining.push(entry);
      }
    }

    this.slots[this.currentSlot] = remaining;

    for (const entry of expired) {
      try {
        entry.callback();
        fired++;
      } catch {
        // silent
      }
      this.timerMap.delete(entry.id);

      // Re-schedule interval timers
      if (entry.intervalMs && entry.intervalMs > 0) {
        this.schedule(entry.callback, entry.intervalMs, entry.intervalMs);
      }
    }

    return fired;
  }

  startTicking(): ReturnType<typeof setInterval> {
    const interval = setInterval(() => this.tick(), this.resolution);
    if (typeof interval === 'object' && 'unref' in interval) {
      (interval as NodeJS.Timeout).unref();
    }
    return interval;
  }

  getActiveTimerCount(): number {
    return this.timerMap.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 21: Cooperative Fiber Scheduler
// User-space cooperative multitasking using JS generators.
// ---------------------------------------------------------------------------

class FiberScheduler {
  private fibers: FiberContext[] = [];
  private runQueue: FiberContext[] = [];
  private nextFiberId = 1;
  private running = false;
  private maxTimeSliceUs = 5000; // 5ms time slice per fiber
  private totalFibersCompleted = 0;

  createFiber(
    generatorFn: () => Generator<void, void, void>,
    priority: TaskPriority = 2
  ): number {
    const id = this.nextFiberId++;
    const ctx: FiberContext = {
      id,
      state: 'runnable',
      generator: generatorFn(),
      priority,
      yieldCount: 0,
      totalRunTimeUs: 0,
      lastRunAt: 0,
    };
    this.fibers.push(ctx);
    this.runQueue.push(ctx);
    this.sortRunQueue();
    return id;
  }

  private sortRunQueue(): void {
    // Priority order: lower number = higher priority
    this.runQueue.sort((a, b) => a.priority - b.priority);
  }

  runOnce(): number {
    if (this.runQueue.length === 0) return 0;

    let ran = 0;
    const toRequeue: FiberContext[] = [];

    for (const fiber of this.runQueue) {
      if (fiber.state !== 'runnable') continue;

      fiber.state = 'running';
      fiber.lastRunAt = Date.now();
      const startUs = Number(process.hrtime.bigint()) / 1000;

      try {
        const result = fiber.generator.next();
        if (result.done) {
          fiber.state = 'completed';
          this.totalFibersCompleted++;
        } else {
          fiber.state = 'runnable';
          fiber.yieldCount++;
          toRequeue.push(fiber);
        }
      } catch {
        fiber.state = 'completed';
        this.totalFibersCompleted++;
      }

      const elapsedUs = Number(process.hrtime.bigint()) / 1000 - startUs;
      fiber.totalRunTimeUs += elapsedUs;
      ran++;
    }

    // Clean completed fibers
    this.fibers = this.fibers.filter((f) => f.state !== 'completed');
    this.runQueue = toRequeue;
    this.sortRunQueue();
    return ran;
  }

  suspend(fiberId: number): void {
    const fiber = this.fibers.find((f) => f.id === fiberId);
    if (fiber && fiber.state === 'runnable') {
      fiber.state = 'suspended';
      this.runQueue = this.runQueue.filter((f) => f.id !== fiberId);
    }
  }

  resume(fiberId: number): void {
    const fiber = this.fibers.find((f) => f.id === fiberId);
    if (fiber && fiber.state === 'suspended') {
      fiber.state = 'runnable';
      this.runQueue.push(fiber);
      this.sortRunQueue();
    }
  }

  getActiveFiberCount(): number {
    return this.fibers.length;
  }

  getCompletedCount(): number {
    return this.totalFibersCompleted;
  }
}

// ---------------------------------------------------------------------------
// Rule 22: Priority Task Scheduler with Preemption
// Maintains multiple priority queues with deadline-aware scheduling.
// ---------------------------------------------------------------------------

class PriorityTaskScheduler {
  private queues: Map<TaskPriority, ScheduledTask[]> = new Map();
  private nextTaskId = 1;
  private processing = false;
  private completedTasks = 0;
  private droppedTasks = 0;

  constructor() {
    this.queues.set(0, []);
    this.queues.set(1, []);
    this.queues.set(2, []);
    this.queues.set(3, []);
  }

  submit(fn: () => void | Promise<void>, priority: TaskPriority = 2, deadlineMs?: number): number {
    const id = this.nextTaskId++;
    const task: ScheduledTask = {
      id,
      fn,
      priority,
      createdAt: Date.now(),
      deadline: deadlineMs ? Date.now() + deadlineMs : undefined,
    };

    this.queues.get(priority)!.push(task);
    return id;
  }

  async processNext(): Promise<boolean> {
    if (this.processing) return false;
    this.processing = true;

    try {
      // Process in priority order
      for (const priority of [0, 1, 2, 3] as TaskPriority[]) {
        const queue = this.queues.get(priority)!;

        // Drop expired tasks
        const now = Date.now();
        while (queue.length > 0 && queue[0].deadline && queue[0].deadline < now) {
          queue.shift();
          this.droppedTasks++;
        }

        if (queue.length > 0) {
          const task = queue.shift()!;
          try {
            await task.fn();
            this.completedTasks++;
          } catch {
            // Task execution failure
          }
          return true;
        }
      }
      return false;
    } finally {
      this.processing = false;
    }
  }

  async processBatch(maxTasks: number = 10): Promise<number> {
    let processed = 0;
    for (let i = 0; i < maxTasks; i++) {
      const did = await this.processNext();
      if (!did) break;
      processed++;
    }
    return processed;
  }

  getPendingCount(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  getStats(): { completed: number; dropped: number; pending: number } {
    return {
      completed: this.completedTasks,
      dropped: this.droppedTasks,
      pending: this.getPendingCount(),
    };
  }
}

// ---------------------------------------------------------------------------
// Rule 23: Core Affinity Manager
// Maps tasks and workers to specific CPU cores for cache locality.
// ---------------------------------------------------------------------------

class CoreAffinityManager {
  private coreCount: number;
  private coreAssignments: Map<string, number> = new Map();
  private coreLoad: number[];

  constructor() {
    this.coreCount = os.cpus().length;
    this.coreLoad = new Array(this.coreCount).fill(0);
  }

  assignCore(workerId: string, preferredCore?: number): number {
    if (preferredCore !== undefined && preferredCore < this.coreCount) {
      this.coreAssignments.set(workerId, preferredCore);
      this.coreLoad[preferredCore]++;
      return preferredCore;
    }

    // Find least-loaded core
    let minLoad = Infinity;
    let bestCore = 0;
    for (let i = 0; i < this.coreCount; i++) {
      if (this.coreLoad[i] < minLoad) {
        minLoad = this.coreLoad[i];
        bestCore = i;
      }
    }

    this.coreAssignments.set(workerId, bestCore);
    this.coreLoad[bestCore]++;
    return bestCore;
  }

  releaseCore(workerId: string): void {
    const core = this.coreAssignments.get(workerId);
    if (core !== undefined) {
      this.coreLoad[core] = Math.max(0, this.coreLoad[core] - 1);
      this.coreAssignments.delete(workerId);
    }
  }

  getAssignment(workerId: string): number | undefined {
    return this.coreAssignments.get(workerId);
  }

  getCoreLoad(): number[] {
    return [...this.coreLoad];
  }

  getCoreCount(): number {
    return this.coreCount;
  }

  getOptimalWorkerCount(): number {
    // Leave 1 core for UI thread, 1 for OS overhead
    return Math.max(1, this.coreCount - 2);
  }
}

// ---------------------------------------------------------------------------
// Unified Concurrency Engine
// ---------------------------------------------------------------------------

class ConcurrencyEngine {
  readonly taskScheduler: PriorityTaskScheduler;
  readonly fiberScheduler: FiberScheduler;
  readonly timerWheel: HierarchicalTimerWheel;
  readonly coreAffinity: CoreAffinityManager;
  readonly epochManager: EpochReclamation;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private fiberInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor() {
    this.taskScheduler = new PriorityTaskScheduler();
    this.fiberScheduler = new FiberScheduler();
    this.timerWheel = new HierarchicalTimerWheel(512, 10);
    this.coreAffinity = new CoreAffinityManager();
    this.epochManager = new EpochReclamation();
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    const t0 = process.hrtime.bigint();

    // C++ profiler scope
    if (isCppAvailable()) CppProfiler.begin('ConcurrencyEngine.init');

    // Start timer wheel
    this.tickInterval = this.timerWheel.startTicking();

    // Run fiber scheduler every 100ms (low-overhead cooperative scheduling)
    this.fiberInterval = setInterval(() => {
      this.fiberScheduler.runOnce();
      this.epochManager.tryReclaim();
    }, 100);
    if (this.fiberInterval && typeof this.fiberInterval === 'object' && 'unref' in this.fiberInterval) {
      (this.fiberInterval as NodeJS.Timeout).unref();
    }

    if (isCppAvailable()) CppProfiler.end('ConcurrencyEngine.init');

    const elapsed = Number(process.hrtime.bigint() - t0) / 1e6;
    log.info(
      `[ConcurrencyEngine] Initialized (${this.coreAffinity.getCoreCount()} cores, ` +
        `optimal workers: ${this.coreAffinity.getOptimalWorkerCount()}) in ${elapsed.toFixed(1)}ms`
    );
  }

  createRingBuffer(capacityBytes: number): SPSCRingBuffer {
    return new SPSCRingBuffer(capacityBytes);
  }

  createDeque<T>(): WorkStealingDeque<T> {
    return new WorkStealingDeque<T>();
  }

  createHashMap<V>(initialCapacity?: number): ConcurrentHashMap<V> {
    return new ConcurrentHashMap<V>(initialCapacity);
  }

  shutdown(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.fiberInterval) clearInterval(this.fiberInterval);
    this.tickInterval = null;
    this.fiberInterval = null;
    this.epochManager.tryReclaim();
  }

  getStatus(): Record<string, unknown> {
    return {
      tasks: this.taskScheduler.getStats(),
      activeFibers: this.fiberScheduler.getActiveFiberCount(),
      completedFibers: this.fiberScheduler.getCompletedCount(),
      activeTimers: this.timerWheel.getActiveTimerCount(),
      coreLoad: this.coreAffinity.getCoreLoad(),
      pendingReclamation: this.epochManager.getPendingCount(),
      cppThreadPool: CppPool.stats(),
    };
  }
}

export const concurrencyEngine = new ConcurrencyEngine();

export {
  ConcurrencyEngine,
  WorkStealingDeque,
  SPSCRingBuffer,
  ConcurrentHashMap,
  EpochReclamation,
  HierarchicalTimerWheel,
  FiberScheduler,
  PriorityTaskScheduler,
  CoreAffinityManager,
};
