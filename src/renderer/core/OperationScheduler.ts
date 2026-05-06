// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * OperationScheduler - Intelligent work prioritization for smooth UI
 * 
 * Schedules operations based on priority, using requestIdleCallback for
 * background work and requestAnimationFrame for visual updates.
 * 
 * Priority levels:
 * - CRITICAL: Immediate execution (user interaction feedback)
 * - HIGH: Next animation frame (visual updates)
 * - NORMAL: Soon, but can be batched (state sync)
 * - IDLE: When browser is idle (analytics, cleanup)
 */

export enum Priority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  IDLE = 3,
}

interface QueuedOperation {
  id: string;
  priority: Priority;
  fn: () => void | Promise<void>;
  deadline?: number;
  added: number;
}

interface SchedulerStats {
  pending: number;
  completed: number;
  avgExecutionTime: number;
}

// Singleton scheduler instance
let instance: OperationScheduler | null = null;

export class OperationScheduler {
  private queue: QueuedOperation[] = [];
  private isProcessing = false;
  private rafId: number | null = null;
  private idleId: number | null = null;
  private stats = { completed: 0, totalTime: 0 };
  private operationIds = new Set<string>();

  // Configuration
  private readonly MAX_FRAME_TIME = 8; // ms - stay under 16ms frame budget
  private readonly IDLE_DEADLINE = 50; // ms - max idle work per callback

  static getInstance(): OperationScheduler {
    if (!instance) {
      instance = new OperationScheduler();
    }
    return instance;
  }

  /**
   * Schedule an operation with given priority
   */
  schedule(
    fn: () => void | Promise<void>,
    priority: Priority = Priority.NORMAL,
    id?: string
  ): string {
    const opId = id || `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // If same ID exists, update priority if higher
    if (id && this.operationIds.has(id)) {
      const existing = this.queue.find(op => op.id === id);
      if (existing && priority < existing.priority) {
        existing.priority = priority;
        existing.fn = fn;
        this.sortQueue();
      }
      return opId;
    }

    const operation: QueuedOperation = {
      id: opId,
      priority,
      fn,
      added: performance.now(),
    };

    this.queue.push(operation);
    this.operationIds.add(opId);
    this.sortQueue();
    this.scheduleProcessing();

    return opId;
  }

  /**
   * Schedule a critical operation (runs immediately)
   */
  critical(fn: () => void | Promise<void>, id?: string): string {
    return this.schedule(fn, Priority.CRITICAL, id);
  }

  /**
   * Schedule a high-priority operation (next frame)
   */
  high(fn: () => void | Promise<void>, id?: string): string {
    return this.schedule(fn, Priority.HIGH, id);
  }

  /**
   * Schedule a normal operation (batched)
   */
  normal(fn: () => void | Promise<void>, id?: string): string {
    return this.schedule(fn, Priority.NORMAL, id);
  }

  /**
   * Schedule an idle operation (when browser is free)
   */
  idle(fn: () => void | Promise<void>, id?: string): string {
    return this.schedule(fn, Priority.IDLE, id);
  }

  /**
   * Cancel a scheduled operation by ID
   */
  cancel(id: string): boolean {
    const index = this.queue.findIndex(op => op.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.operationIds.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Flush all pending operations immediately
   */
  flush(): void {
    while (this.queue.length > 0) {
      const op = this.queue.shift()!;
      this.operationIds.delete(op.id);
      try {
        op.fn();
      } catch (e) {
        console.error('[OperationScheduler] Flush error:', e);
      }
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    return {
      pending: this.queue.length,
      completed: this.stats.completed,
      avgExecutionTime: this.stats.completed > 0 
        ? this.stats.totalTime / this.stats.completed 
        : 0,
    };
  }

  private sortQueue(): void {
    // Sort by priority (lower = higher priority), then by added time
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.added - b.added;
    });
  }

  private scheduleProcessing(): void {
    if (this.isProcessing) return;

    const hasHighPriority = this.queue.some(op => op.priority <= Priority.HIGH);
    const hasCritical = this.queue.some(op => op.priority === Priority.CRITICAL);

    // Critical: execute immediately
    if (hasCritical) {
      this.processCritical();
    }

    // High priority: use RAF
    if (hasHighPriority && this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.processHighPriority();
      });
    }

    // Idle: use requestIdleCallback
    if (this.queue.some(op => op.priority >= Priority.NORMAL) && this.idleId === null) {
      if (typeof requestIdleCallback !== 'undefined') {
        this.idleId = requestIdleCallback(
          (deadline) => {
            this.idleId = null;
            this.processIdle(deadline);
          },
          { timeout: 2000 }
        );
      } else {
        // Fallback for browsers without requestIdleCallback
        this.idleId = setTimeout(() => {
          this.idleId = null;
          this.processIdle({ timeRemaining: () => this.IDLE_DEADLINE, didTimeout: false });
        }, 100) as unknown as number;
      }
    }
  }

  private processCritical(): void {
    const criticalOps = this.queue.filter(op => op.priority === Priority.CRITICAL);
    this.queue = this.queue.filter(op => op.priority !== Priority.CRITICAL);

    for (const op of criticalOps) {
      this.operationIds.delete(op.id);
      this.executeOperation(op);
    }
  }

  private processHighPriority(): void {
    const startTime = performance.now();
    
    while (this.queue.length > 0 && this.queue[0].priority <= Priority.HIGH) {
      if (performance.now() - startTime > this.MAX_FRAME_TIME) {
        // Over budget, schedule continuation
        this.scheduleProcessing();
        break;
      }

      const op = this.queue.shift()!;
      this.operationIds.delete(op.id);
      this.executeOperation(op);
    }
  }

  private processIdle(deadline: IdleDeadline): void {
    while (this.queue.length > 0 && deadline.timeRemaining() > 0) {
      const op = this.queue.shift()!;
      this.operationIds.delete(op.id);
      this.executeOperation(op);
    }

    // If more work remains, schedule another idle callback
    if (this.queue.length > 0) {
      this.scheduleProcessing();
    }
  }

  private executeOperation(op: QueuedOperation): void {
    const start = performance.now();
    try {
      const result = op.fn();
      if (result instanceof Promise) {
        result.catch(e => console.error('[OperationScheduler] Async error:', e));
      }
    } catch (e) {
      console.error('[OperationScheduler] Sync error:', e);
    }
    const elapsed = performance.now() - start;
    this.stats.completed++;
    this.stats.totalTime += elapsed;
  }

  /**
   * Destroy the scheduler and cancel all pending operations
   */
  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.idleId !== null) {
      if ('cancelIdleCallback' in window) {
        cancelIdleCallback(this.idleId);
      } else {
        clearTimeout(this.idleId);
      }
      this.idleId = null;
    }
    this.queue = [];
    this.operationIds.clear();
    instance = null;
  }
}

// Convenience exports
export const scheduler = OperationScheduler.getInstance();

/**
 * Decorator for methods that should be scheduled
 */
export function scheduled(priority: Priority = Priority.NORMAL) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: unknown[]) {
      scheduler.schedule(() => originalMethod.apply(this, args), priority);
    };
    return descriptor;
  };
}

/**
 * Throttled scheduler - ensures operation runs at most once per interval
 */
export function createThrottledScheduler(intervalMs: number) {
  let lastRun = 0;
  let pending: (() => void) | null = null;
  let timeoutId: number | null = null;

  return {
    schedule(fn: () => void, priority: Priority = Priority.NORMAL): void {
      const now = performance.now();
      const elapsed = now - lastRun;

      if (elapsed >= intervalMs) {
        lastRun = now;
        scheduler.schedule(fn, priority);
      } else {
        pending = fn;
        if (timeoutId === null) {
          timeoutId = window.setTimeout(() => {
            timeoutId = null;
            if (pending) {
              lastRun = performance.now();
              scheduler.schedule(pending, priority);
              pending = null;
            }
          }, intervalMs - elapsed);
        }
      }
    },
    cancel(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      pending = null;
    },
  };
}

/**
 * Debounced scheduler - delays execution until quiet period
 */
export function createDebouncedScheduler(delayMs: number) {
  let timeoutId: number | null = null;

  return {
    schedule(fn: () => void, priority: Priority = Priority.NORMAL): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        scheduler.schedule(fn, priority);
      }, delayMs);
    },
    cancel(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    flush(fn: () => void, priority: Priority = Priority.NORMAL): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      scheduler.schedule(fn, priority);
    },
  };
}
