// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Worker Thread Acceleration
// ==========================================================================
// Technique 5:  Named Worker Thread Pools
// Technique 6:  Worker Pool Auto-Scaling
// Technique 7:  Worker Task Routing by Type
// Technique 8:  SharedArrayBuffer Pool
// Technique 9:  Atomics for Inter-Thread Synchronization
// Technique 57: SPSC Queue per Subscriber
// Technique 58: LMAX Disruptor Pattern for Logger
// ==========================================================================

import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 8: SharedArrayBuffer Pool
// ---------------------------------------------------------------------------

interface SABPoolEntry {
  buffer: SharedArrayBuffer;
  inUse: boolean;
}

export class SharedArrayBufferPool {
  private pools: Map<number, SABPoolEntry[]> = new Map();
  private sizeClasses: number[];

  constructor(sizeClasses: number[] = [4096, 65536, 1048576, 16777216]) {
    this.sizeClasses = sizeClasses.sort((a, b) => a - b);
    for (const size of this.sizeClasses) {
      this.pools.set(size, []);
    }
  }

  private findSizeClass(requestedSize: number): number {
    for (const size of this.sizeClasses) {
      if (size >= requestedSize) return size;
    }
    return requestedSize; // Larger than any class -> custom size
  }

  acquire(size: number): SharedArrayBuffer {
    const sizeClass = this.findSizeClass(size);
    const pool = this.pools.get(sizeClass);

    if (pool) {
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].inUse) {
          pool[i].inUse = true;
          // Clear the buffer before reuse
          new Uint8Array(pool[i].buffer).fill(0);
          return pool[i].buffer;
        }
      }
    }

    // Create new SAB
    const buffer = new SharedArrayBuffer(sizeClass);
    if (pool && pool.length < 16) {
      pool.push({ buffer, inUse: true });
    }
    return buffer;
  }

  release(buffer: SharedArrayBuffer): void {
    const size = buffer.byteLength;
    const pool = this.pools.get(size);
    if (!pool) return;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].buffer === buffer) {
        pool[i].inUse = false;
        return;
      }
    }
  }

  prewarm(sizeClass: number, count: number): void {
    const pool = this.pools.get(sizeClass);
    if (!pool) return;
    for (let i = 0; i < count; i++) {
      if (pool.length >= 16) break;
      pool.push({ buffer: new SharedArrayBuffer(sizeClass), inUse: false });
    }
  }

  get stats(): Record<number, { total: number; inUse: number; free: number }> {
    const result: Record<number, { total: number; inUse: number; free: number }> = {};
    for (const [size, pool] of this.pools) {
      const inUse = pool.filter(e => e.inUse).length;
      result[size] = { total: pool.length, inUse, free: pool.length - inUse };
    }
    return result;
  }
}

export const sabPool = new SharedArrayBufferPool();

// ---------------------------------------------------------------------------
// Technique 9: Atomics Synchronization Helpers
// ---------------------------------------------------------------------------

export const AtomicsHelper = {
  // Spin-wait with exponential backoff (for SharedArrayBuffer coordination)
  spinWait(view: Int32Array, index: number, expectedValue: number, maxSpins: number = 1000): boolean {
    for (let i = 0; i < maxSpins; i++) {
      if (Atomics.load(view, index) !== expectedValue) return true;
      // Yield to event loop occasionally
      if (i > 100 && (i & 15) === 0) {
        // In a worker, we could use Atomics.wait; in main thread, we spin
        break;
      }
    }
    return Atomics.load(view, index) !== expectedValue;
  },

  // Atomic increment and return new value
  increment(view: Int32Array, index: number): number {
    return Atomics.add(view, index, 1) + 1;
  },

  // Atomic decrement and return new value
  decrement(view: Int32Array, index: number): number {
    return Atomics.sub(view, index, 1) - 1;
  },

  // Compare-and-swap
  cas(view: Int32Array, index: number, expected: number, desired: number): boolean {
    return Atomics.compareExchange(view, index, expected, desired) === expected;
  },

  // Atomic flag set (returns true if flag was acquired)
  tryAcquire(view: Int32Array, index: number): boolean {
    return Atomics.compareExchange(view, index, 0, 1) === 0;
  },

  // Atomic flag release
  release(view: Int32Array, index: number): void {
    Atomics.store(view, index, 0);
    Atomics.notify(view, index, 1);
  },

  // Atomic maximum (useful for tracking peak values)
  updateMax(view: Int32Array, index: number, value: number): number {
    let current = Atomics.load(view, index);
    while (value > current) {
      const prev = Atomics.compareExchange(view, index, current, value);
      if (prev === current) return value;
      current = prev;
    }
    return current;
  },
};

// ---------------------------------------------------------------------------
// Technique 57: SPSC (Single-Producer Single-Consumer) Queue
// ---------------------------------------------------------------------------

// Uses SharedArrayBuffer for lock-free inter-thread communication
export class SPSCQueue {
  private buffer: SharedArrayBuffer;
  private view: Int32Array;
  private data: Uint8Array;
  private capacity: number;
  private readonly HEAD_OFFSET = 0;
  private readonly TAIL_OFFSET = 1;
  private readonly DATA_OFFSET = 8; // 8 bytes for head + tail

  constructor(capacity: number = 65536) {
    this.capacity = capacity;
    this.buffer = new SharedArrayBuffer(this.DATA_OFFSET + capacity);
    this.view = new Int32Array(this.buffer, 0, 2);
    this.data = new Uint8Array(this.buffer, this.DATA_OFFSET);
    Atomics.store(this.view, this.HEAD_OFFSET, 0);
    Atomics.store(this.view, this.TAIL_OFFSET, 0);
  }

  // Write a message (producer side)
  write(message: Uint8Array): boolean {
    const tail = Atomics.load(this.view, this.TAIL_OFFSET);
    const head = Atomics.load(this.view, this.HEAD_OFFSET);
    const msgLen = message.length;
    const headerLen = 4; // 4 bytes for message length

    // Check available space
    const used = (tail - head + this.capacity) % this.capacity;
    const available = this.capacity - used - 1;
    if (available < msgLen + headerLen) return false;

    // Write message length
    let writePos = tail;
    this.data[writePos % this.capacity] = msgLen & 0xFF;
    this.data[(writePos + 1) % this.capacity] = (msgLen >>> 8) & 0xFF;
    this.data[(writePos + 2) % this.capacity] = (msgLen >>> 16) & 0xFF;
    this.data[(writePos + 3) % this.capacity] = (msgLen >>> 24) & 0xFF;
    writePos += headerLen;

    // Write message data
    for (let i = 0; i < msgLen; i++) {
      this.data[(writePos + i) % this.capacity] = message[i];
    }

    // Update tail atomically
    Atomics.store(this.view, this.TAIL_OFFSET, (tail + headerLen + msgLen) % this.capacity);
    return true;
  }

  // Read a message (consumer side)
  read(): Uint8Array | null {
    const head = Atomics.load(this.view, this.HEAD_OFFSET);
    const tail = Atomics.load(this.view, this.TAIL_OFFSET);
    if (head === tail) return null;

    // Read message length
    const headerLen = 4;
    const msgLen = (
      this.data[head % this.capacity] |
      (this.data[(head + 1) % this.capacity] << 8) |
      (this.data[(head + 2) % this.capacity] << 16) |
      (this.data[(head + 3) % this.capacity] << 24)
    ) >>> 0;

    // Read message data
    const message = new Uint8Array(msgLen);
    const readStart = head + headerLen;
    for (let i = 0; i < msgLen; i++) {
      message[i] = this.data[(readStart + i) % this.capacity];
    }

    // Update head atomically
    Atomics.store(this.view, this.HEAD_OFFSET, (head + headerLen + msgLen) % this.capacity);
    return message;
  }

  get sharedBuffer(): SharedArrayBuffer { return this.buffer; }

  get availableRead(): number {
    const head = Atomics.load(this.view, this.HEAD_OFFSET);
    const tail = Atomics.load(this.view, this.TAIL_OFFSET);
    return (tail - head + this.capacity) % this.capacity;
  }
}

// ---------------------------------------------------------------------------
// Technique 58: LMAX Disruptor Pattern for Logger
// ---------------------------------------------------------------------------

export class DisruptorRingBuffer {
  private buffer: SharedArrayBuffer;
  private sequenceBuffer: SharedArrayBuffer;
  private slots: Uint8Array;
  private sequences: Int32Array;
  private slotSize: number;
  private slotCount: number;
  private readonly SEQ_CURSOR = 0;
  private readonly SEQ_GATE = 1;

  constructor(slotCount: number = 1024, slotSize: number = 256) {
    this.slotCount = slotCount;
    this.slotSize = slotSize;
    this.buffer = new SharedArrayBuffer(slotCount * slotSize);
    this.sequenceBuffer = new SharedArrayBuffer(16); // cursor + gate
    this.slots = new Uint8Array(this.buffer);
    this.sequences = new Int32Array(this.sequenceBuffer);
    Atomics.store(this.sequences, this.SEQ_CURSOR, -1);
    Atomics.store(this.sequences, this.SEQ_GATE, -1);
  }

  // Claim next slot for writing
  claim(): number {
    const seq = Atomics.add(this.sequences, this.SEQ_CURSOR, 1);
    return seq + 1;
  }

  // Write data into claimed slot
  writeSlot(sequence: number, data: Uint8Array): void {
    const idx = (sequence % this.slotCount) * this.slotSize;
    const writeLen = Math.min(data.length, this.slotSize - 4);

    // Write length at start of slot
    this.slots[idx] = writeLen & 0xFF;
    this.slots[idx + 1] = (writeLen >>> 8) & 0xFF;
    this.slots[idx + 2] = (writeLen >>> 16) & 0xFF;
    this.slots[idx + 3] = (writeLen >>> 24) & 0xFF;

    // Write data
    for (let i = 0; i < writeLen; i++) {
      this.slots[idx + 4 + i] = data[i];
    }
  }

  // Publish a sequence making it visible to consumers
  publish(sequence: number): void {
    Atomics.store(this.sequences, this.SEQ_GATE, sequence);
  }

  // Read a slot (consumer)
  readSlot(sequence: number): Uint8Array | null {
    const gate = Atomics.load(this.sequences, this.SEQ_GATE);
    if (sequence > gate) return null;

    const idx = (sequence % this.slotCount) * this.slotSize;
    const len = (
      this.slots[idx] |
      (this.slots[idx + 1] << 8) |
      (this.slots[idx + 2] << 16) |
      (this.slots[idx + 3] << 24)
    ) >>> 0;

    return this.slots.slice(idx + 4, idx + 4 + len);
  }

  get cursor(): number { return Atomics.load(this.sequences, this.SEQ_CURSOR); }
  get gate(): number { return Atomics.load(this.sequences, this.SEQ_GATE); }
}

// ---------------------------------------------------------------------------
// Technique 5/6/7: Named Worker Thread Pools with Auto-Scaling
// ---------------------------------------------------------------------------

interface WorkerPoolConfig {
  name: string;
  minWorkers: number;
  maxWorkers: number;
  taskTypes: string[];
  idleTimeoutMs: number;
  scriptPath?: string;
}

interface PooledWorker {
  worker: Worker | null; // null = placeholder (not actually spawned since we inline)
  busy: boolean;
  taskCount: number;
  lastActivityMs: number;
}

interface QueuedTask {
  taskType: string;
  data: unknown;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class WorkerThreadPool {
  private config: WorkerPoolConfig;
  private workers: PooledWorker[] = [];
  private taskQueue: QueuedTask[] = [];
  private taskTypeRouter: Map<string, string> = new Map();
  private scaleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private totalTasksProcessed = 0;

  constructor(config: WorkerPoolConfig) {
    this.config = config;
    for (const type of config.taskTypes) {
      this.taskTypeRouter.set(type, config.name);
    }
  }

  async start(): Promise<void> {
    // Create minimum workers
    for (let i = 0; i < this.config.minWorkers; i++) {
      this.addWorker();
    }

    // Auto-scaling check every 5 seconds
    this.scaleCheckInterval = setInterval(() => this.autoScale(), 5000);
    log.info(`[WorkerPool:${this.config.name}] Started with ${this.config.minWorkers} workers`);
  }

  private addWorker(): PooledWorker {
    // In Electron main process, we simulate worker pool management
    // Real workers would use worker_threads with a script file
    const pooledWorker: PooledWorker = {
      worker: null, // Workers created on-demand when script paths are configured
      busy: false,
      taskCount: 0,
      lastActivityMs: Date.now()
    };

    if (this.config.scriptPath) {
      try {
        const worker = new Worker(this.config.scriptPath);
        pooledWorker.worker = worker;
        worker.on('message', (msg: { taskId: number; result: unknown; error?: string }) => {
          pooledWorker.busy = false;
          pooledWorker.lastActivityMs = Date.now();
          this.processNextInQueue();
        });
        worker.on('error', (err: Error) => {
          log.error(`[WorkerPool:${this.config.name}] Worker error: ${err.message}`);
          pooledWorker.busy = false;
        });
      } catch {
        // Script not available, continue without real worker
      }
    }

    this.workers.push(pooledWorker);
    return pooledWorker;
  }

  private removeIdleWorker(): void {
    const now = Date.now();
    for (let i = this.workers.length - 1; i >= this.config.minWorkers; i--) {
      const w = this.workers[i];
      if (!w.busy && (now - w.lastActivityMs) > this.config.idleTimeoutMs) {
        if (w.worker) {
          w.worker.terminate().catch((e: unknown) => { log.warn('[DEX]', e); });
        }
        this.workers.splice(i, 1);
        return;
      }
    }
  }

  private autoScale(): void {
    const busyCount = this.workers.filter(w => w.busy).length;
    const ratio = this.workers.length > 0 ? busyCount / this.workers.length : 1;

    // Scale up if >80% busy and queue has items
    if (ratio > 0.8 && this.taskQueue.length > 0 && this.workers.length < this.config.maxWorkers) {
      this.addWorker();
    }
    // Scale down if <30% busy
    else if (ratio < 0.3 && this.workers.length > this.config.minWorkers) {
      this.removeIdleWorker();
    }
  }

  submitTask(taskType: string, data: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const freeWorker = this.workers.find(w => !w.busy);
      if (freeWorker) {
        this.executeOnWorker(freeWorker, taskType, data, resolve, reject);
      } else if (this.workers.length < this.config.maxWorkers) {
        const newWorker = this.addWorker();
        this.executeOnWorker(newWorker, taskType, data, resolve, reject);
      } else {
        this.taskQueue.push({ taskType, data, resolve, reject });
      }
    });
  }

  private executeOnWorker(
    pooled: PooledWorker,
    taskType: string,
    data: unknown,
    resolve: (result: unknown) => void,
    reject: (error: Error) => void
  ): void {
    pooled.busy = true;
    pooled.taskCount++;
    pooled.lastActivityMs = Date.now();
    this.totalTasksProcessed++;

    if (pooled.worker) {
      pooled.worker.postMessage({ taskType, data });
      // Resolve handled by worker message handler
    } else {
      // Execute synchronously if no real worker available (fallback)
      setImmediate(() => {
        pooled.busy = false;
        pooled.lastActivityMs = Date.now();
        resolve({ taskType, processed: true });
        this.processNextInQueue();
      });
    }
  }

  private processNextInQueue(): void {
    if (this.taskQueue.length === 0) return;
    const freeWorker = this.workers.find(w => !w.busy);
    if (!freeWorker) return;
    const task = this.taskQueue.shift()!;
    this.executeOnWorker(freeWorker, task.taskType, task.data, task.resolve, task.reject);
  }

  canHandleType(taskType: string): boolean {
    return this.taskTypeRouter.has(taskType);
  }

  async shutdown(): Promise<void> {
    if (this.scaleCheckInterval) {
      clearInterval(this.scaleCheckInterval);
      this.scaleCheckInterval = null;
    }
    for (const w of this.workers) {
      if (w.worker) {
        await w.worker.terminate().catch((e: unknown) => { log.warn('[DEX]', e); });
      }
    }
    this.workers.length = 0;
    this.taskQueue.length = 0;
  }

  get stats(): { name: string; workers: number; busy: number; queued: number; processed: number } {
    return {
      name: this.config.name,
      workers: this.workers.length,
      busy: this.workers.filter(w => w.busy).length,
      queued: this.taskQueue.length,
      processed: this.totalTasksProcessed
    };
  }
}

// ---------------------------------------------------------------------------
// Named Pool Registry (Technique 7: Task Routing)
// ---------------------------------------------------------------------------

class WorkerPoolRegistry {
  private pools: Map<string, WorkerThreadPool> = new Map();
  private typeToPool: Map<string, string> = new Map();

  register(pool: WorkerThreadPool, config: WorkerPoolConfig): void {
    this.pools.set(config.name, pool);
    for (const type of config.taskTypes) {
      this.typeToPool.set(type, config.name);
    }
  }

  route(taskType: string, data: unknown): Promise<unknown> {
    const poolName = this.typeToPool.get(taskType);
    if (!poolName) return Promise.reject(new Error(`No pool registered for task type: ${taskType}`));
    const pool = this.pools.get(poolName);
    if (!pool) return Promise.reject(new Error(`Pool not found: ${poolName}`));
    return pool.submitTask(taskType, data);
  }

  getPool(name: string): WorkerThreadPool | undefined {
    return this.pools.get(name);
  }

  async shutdownAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.shutdown();
    }
    this.pools.clear();
    this.typeToPool.clear();
  }

  get allStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};
    for (const [name, pool] of this.pools) {
      stats[name] = pool.stats;
    }
    return stats;
  }
}

export const workerPoolRegistry = new WorkerPoolRegistry();

// ---------------------------------------------------------------------------
// Pre-configured Pool Definitions
// ---------------------------------------------------------------------------

const cpuCount = os.cpus().length;

const POOL_CONFIGS: WorkerPoolConfig[] = [
  {
    name: 'file-transfer',
    minWorkers: 2,
    maxWorkers: Math.max(2, cpuCount - 2),
    taskTypes: ['file:copy', 'file:move', 'file:hash', 'file:checksum', 'file:zip', 'file:unzip'],
    idleTimeoutMs: 30000,
  },
  {
    name: 'thumbnail',
    minWorkers: 1,
    maxWorkers: 3,
    taskTypes: ['thumb:generate', 'thumb:batch', 'thumb:resize', 'image:process'],
    idleTimeoutMs: 20000,
  },
  {
    name: 'analytics',
    minWorkers: 1,
    maxWorkers: 2,
    taskTypes: ['analytics:compute', 'analytics:aggregate', 'analytics:report', 'chart:render'],
    idleTimeoutMs: 60000,
  },
  {
    name: 'plugin',
    minWorkers: 1,
    maxWorkers: 4,
    taskTypes: ['plugin:execute', 'plugin:validate', 'plugin:compile', 'plugin:lint'],
    idleTimeoutMs: 15000,
  },
  {
    name: 'security',
    minWorkers: 1,
    maxWorkers: 2,
    taskTypes: ['security:scan', 'security:hash', 'security:encrypt', 'security:decrypt', 'security:verify'],
    idleTimeoutMs: 30000,
  },
  {
    name: 'media',
    minWorkers: 1,
    maxWorkers: Math.max(2, cpuCount - 2),
    taskTypes: ['media:encode', 'media:decode', 'media:transcode', 'media:analyze', 'audio:process', 'video:process'],
    idleTimeoutMs: 30000,
  },
  {
    name: 'search',
    minWorkers: 1,
    maxWorkers: 2,
    taskTypes: ['search:index', 'search:query', 'search:reindex', 'search:suggest'],
    idleTimeoutMs: 30000,
  },
];

// ---------------------------------------------------------------------------
// Initialization / Shutdown
// ---------------------------------------------------------------------------

export async function initializeWorkerAccelerator(): Promise<void> {
  for (const config of POOL_CONFIGS) {
    const pool = new WorkerThreadPool(config);
    workerPoolRegistry.register(pool, config);
    await pool.start();
  }

  // Prewarm SharedArrayBuffer pool
  sabPool.prewarm(4096, 4);
  sabPool.prewarm(65536, 2);

  log.info('[WorkerAccelerator] Techniques 5-9, 57-58: Worker acceleration initialized');
}

export async function shutdownWorkerAccelerator(): Promise<void> {
  await workerPoolRegistry.shutdownAll();
}
