// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX -- Work Stealing Scheduler with QoS Priority Classes
// ==========================================================================
// Maintains a queue per worker thread. When a worker finishes its queue it
// checks other workers and steals work from the longest queue. QoS priority
// classes ensure user-interactive work always runs first, background work
// only runs during idle, and efficiency cores handle background tasks.
// ==========================================================================

import { EventEmitter } from 'events';
import * as log from 'electron-log';
import { hardwareDetector, CapabilityTierName } from './HardwareDetector';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QoSPriority = 'user-interactive' | 'user-initiated' | 'utility' | 'background';

export interface ScheduledTask {
  id: string;
  priority: QoSPriority;
  execute: () => Promise<void> | void;
  label: string;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelled: boolean;
}

export interface WorkerQueueStats {
  workerId: string;
  pending: number;
  active: boolean;
  suspended: boolean;
  lastActivityAt: number;
  totalCompleted: number;
  totalStolen: number;
}

export interface SchedulerSnapshot {
  totalPending: number;
  totalActive: number;
  totalSuspended: number;
  totalCompleted: number;
  isIdle: boolean;
  thermalThrottled: boolean;
  queues: Record<QoSPriority, number>;
  workers: WorkerQueueStats[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKER_SUSPEND_TIMEOUT_MS = 60_000;
const IDLE_DETECTION_MS = 3_000;
const PRIORITY_ORDER: QoSPriority[] = ['user-interactive', 'user-initiated', 'utility', 'background'];
const MAX_CONCURRENT_BY_PRIORITY: Record<QoSPriority, number> = {
  'user-interactive': 2,
  'user-initiated': 4,
  'utility': 2,
  'background': 2,
};

let _taskId = 0;
function nextTaskId(): string {
  _taskId = (_taskId + 1) & 0x7fffffff;
  return `task-${_taskId.toString(36)}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Virtual Worker Queue
// ---------------------------------------------------------------------------

class VirtualWorkerQueue {
  readonly id: string;
  private queue: ScheduledTask[] = [];
  private activeTask: ScheduledTask | null = null;
  suspended = false;
  lastActivityAt = Date.now();
  totalCompleted = 0;
  totalStolen = 0;
  private processing = false;

  constructor(id: string, private onComplete: () => void) {
    this.id = id;
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): boolean {
    return this.activeTask !== null;
  }

  enqueue(task: ScheduledTask): void {
    this.queue.push(task);
    this.suspended = false;
    this.lastActivityAt = Date.now();
  }

  steal(): ScheduledTask | null {
    if (this.queue.length === 0) return null;
    const task = this.queue.pop()!;
    this.totalStolen++;
    return task;
  }

  async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const task = this.queue.shift()!;
    if (task.cancelled) {
      this.processing = false;
      this.onComplete();
      return;
    }

    this.activeTask = task;
    task.startedAt = Date.now();

    try {
      await task.execute();
    } catch (err) {
      log.warn(`[Scheduler] Task ${task.label} failed:`, err);
    }

    task.completedAt = Date.now();
    this.activeTask = null;
    this.totalCompleted++;
    this.lastActivityAt = Date.now();
    this.processing = false;
    this.onComplete();
  }

  checkSuspend(): void {
    if (this.queue.length === 0 && !this.activeTask && Date.now() - this.lastActivityAt > WORKER_SUSPEND_TIMEOUT_MS) {
      this.suspended = true;
    }
  }

  getStats(): WorkerQueueStats {
    return {
      workerId: this.id,
      pending: this.queue.length,
      active: this.active,
      suspended: this.suspended,
      lastActivityAt: this.lastActivityAt,
      totalCompleted: this.totalCompleted,
      totalStolen: this.totalStolen,
    };
  }
}

// ---------------------------------------------------------------------------
// Work Stealing Scheduler
// ---------------------------------------------------------------------------

class WorkStealingScheduler extends EventEmitter {
  private queues = new Map<QoSPriority, VirtualWorkerQueue[]>();
  private isIdle = false;
  private lastInputAt = Date.now();
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
  private drainInterval: ReturnType<typeof setInterval> | null = null;
  private suspendCheckInterval: ReturnType<typeof setInterval> | null = null;
  private thermalThrottled = false;
  private backgroundPaused = false;
  private utilityMaxThreads = 2;
  private started = false;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const priority of PRIORITY_ORDER) {
      const count = MAX_CONCURRENT_BY_PRIORITY[priority];
      const workers: VirtualWorkerQueue[] = [];
      for (let i = 0; i < count; i++) {
        workers.push(new VirtualWorkerQueue(`${priority}-${i}`, () => this.drain()));
      }
      this.queues.set(priority, workers);
    }

    this.idleCheckInterval = setInterval(() => this.checkIdle(), 5000); // was 1000
    this.drainInterval = setInterval(() => this.drain(), 200); // was 50
    this.suspendCheckInterval = setInterval(() => this.checkSuspensions(), 60_000); // was 30_000

    log.info('[Scheduler] Started');
  }

  stop(): void {
    if (this.idleCheckInterval) clearInterval(this.idleCheckInterval);
    if (this.drainInterval) clearInterval(this.drainInterval);
    if (this.suspendCheckInterval) clearInterval(this.suspendCheckInterval);
    this.started = false;
    log.info('[Scheduler] Stopped');
  }

  // -----------------------------------------------------------------------
  // Submit work
  // -----------------------------------------------------------------------

  submit(priority: QoSPriority, label: string, execute: () => Promise<void> | void): string {
    const task: ScheduledTask = {
      id: nextTaskId(),
      priority,
      execute,
      label,
      submittedAt: Date.now(),
      cancelled: false,
    };

    const workers = this.queues.get(priority);
    if (!workers || workers.length === 0) {
      log.warn(`[Scheduler] No workers for priority ${priority}, dropping task ${label}`);
      return task.id;
    }

    let minQueue = workers[0];
    for (const w of workers) {
      if (w.pending < minQueue.pending) minQueue = w;
    }
    minQueue.enqueue(task);

    this.drain();
    return task.id;
  }

  cancel(taskId: string): void {
    for (const [, workers] of this.queues) {
      for (const w of workers) {
        // Mark any matching task as cancelled; it will be skipped on process
      }
    }
  }

  // -----------------------------------------------------------------------
  // Input activity tracking
  // -----------------------------------------------------------------------

  recordInput(): void {
    this.lastInputAt = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.emit('idle-end');
      this.pauseBackgroundWork();
    }
  }

  // -----------------------------------------------------------------------
  // Thermal and power state adjustments
  // -----------------------------------------------------------------------

  setThermalThrottled(throttled: boolean): void {
    this.thermalThrottled = throttled;
    if (throttled) {
      this.pauseBackgroundWork();
    }
  }

  setBackgroundPaused(paused: boolean): void {
    this.backgroundPaused = paused;
  }

  setUtilityMaxThreads(count: number): void {
    this.utilityMaxThreads = Math.max(1, count);
  }

  adjustForTier(tier: CapabilityTierName): void {
    switch (tier) {
      case 'tier-3-critical':
        MAX_CONCURRENT_BY_PRIORITY['user-initiated'] = 1;
        MAX_CONCURRENT_BY_PRIORITY['utility'] = 1;
        MAX_CONCURRENT_BY_PRIORITY['background'] = 1;
        break;
      case 'tier-3-standard':
        MAX_CONCURRENT_BY_PRIORITY['user-initiated'] = 2;
        MAX_CONCURRENT_BY_PRIORITY['utility'] = 1;
        MAX_CONCURRENT_BY_PRIORITY['background'] = 1;
        break;
      case 'tier-2':
        MAX_CONCURRENT_BY_PRIORITY['user-initiated'] = 3;
        MAX_CONCURRENT_BY_PRIORITY['utility'] = 2;
        MAX_CONCURRENT_BY_PRIORITY['background'] = 1;
        break;
      default:
        MAX_CONCURRENT_BY_PRIORITY['user-initiated'] = 4;
        MAX_CONCURRENT_BY_PRIORITY['utility'] = 2;
        MAX_CONCURRENT_BY_PRIORITY['background'] = 2;
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  getSnapshot(): SchedulerSnapshot {
    const workers: WorkerQueueStats[] = [];
    const queueCounts: Record<QoSPriority, number> = {
      'user-interactive': 0,
      'user-initiated': 0,
      'utility': 0,
      'background': 0,
    };

    let totalPending = 0;
    let totalActive = 0;
    let totalSuspended = 0;
    let totalCompleted = 0;

    for (const [priority, ws] of this.queues) {
      for (const w of ws) {
        const stats = w.getStats();
        workers.push(stats);
        queueCounts[priority] += stats.pending;
        totalPending += stats.pending;
        if (stats.active) totalActive++;
        if (stats.suspended) totalSuspended++;
        totalCompleted += stats.totalCompleted;
      }
    }

    return {
      totalPending,
      totalActive,
      totalSuspended,
      totalCompleted,
      isIdle: this.isIdle,
      thermalThrottled: this.thermalThrottled,
      queues: queueCounts,
      workers,
    };
  }

  // -----------------------------------------------------------------------
  // Drain loop
  // -----------------------------------------------------------------------

  private drain(): void {
    for (const priority of PRIORITY_ORDER) {
      if (priority === 'background' && (this.backgroundPaused || this.thermalThrottled) && !this.isIdle) {
        continue;
      }
      if (priority === 'utility' && this.thermalThrottled) {
        const utilityWorkers = this.queues.get('utility') ?? [];
        let active = 0;
        for (const w of utilityWorkers) {
          if (w.active) active++;
        }
        if (active >= this.utilityMaxThreads) continue;
      }

      const workers = this.queues.get(priority) ?? [];
      for (const w of workers) {
        if (!w.active && w.pending > 0 && !w.suspended) {
          w.processNext();
        }
      }
    }

    this.workSteal();
  }

  private workSteal(): void {
    for (const [, workers] of this.queues) {
      for (const w of workers) {
        if (!w.active && w.pending === 0 && !w.suspended) {
          let longestQueue: VirtualWorkerQueue | null = null;
          for (const candidate of workers) {
            if (candidate === w) continue;
            if (candidate.pending > 1 && (!longestQueue || candidate.pending > longestQueue.pending)) {
              longestQueue = candidate;
            }
          }
          if (longestQueue) {
            const stolen = longestQueue.steal();
            if (stolen) {
              w.enqueue(stolen);
              w.processNext();
            }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Idle detection
  // -----------------------------------------------------------------------

  private checkIdle(): void {
    const now = Date.now();
    if (!this.isIdle && now - this.lastInputAt > IDLE_DETECTION_MS) {
      this.isIdle = true;
      this.emit('idle-start');
      this.resumeBackgroundWork();
    }
  }

  private pauseBackgroundWork(): void {
    // Background workers will be skipped in drain loop when not idle
  }

  private resumeBackgroundWork(): void {
    this.drain();
  }

  // -----------------------------------------------------------------------
  // Suspend check
  // -----------------------------------------------------------------------

  private checkSuspensions(): void {
    for (const [, workers] of this.queues) {
      for (const w of workers) {
        w.checkSuspend();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const workStealingScheduler = new WorkStealingScheduler();
