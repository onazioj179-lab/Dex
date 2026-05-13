// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * IdleQueue: schedules low-priority work via requestIdleCallback when
 * available, otherwise falls back to setTimeout. Tasks are processed
 * sequentially in FIFO order.
 */

type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

const ric: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => number =
  (typeof globalThis !== 'undefined' && typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback === 'function')
    ? ((globalThis as unknown) as { requestIdleCallback: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => number }).requestIdleCallback
    : ((cb: (d: IdleDeadline) => void) => {
        return setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 16 }), 16) as unknown as number;
      });

const cic: (handle: number) => void =
  (typeof globalThis !== 'undefined' && typeof (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback === 'function')
    ? ((globalThis as unknown) as { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback
    : ((handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));

export interface IdleQueueOptions {
  /** Default idle timeout per work slice in ms. */
  timeoutMs?: number;
  /** Minimum ms remaining required to run the next task in a slice. */
  minTimeRemainingMs?: number;
}

export class IdleQueue {
  private readonly tasks: Array<() => void> = [];
  private readonly timeoutMs: number;
  private readonly minTimeRemainingMs: number;
  private handle: number | null = null;

  constructor(options: IdleQueueOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.minTimeRemainingMs = options.minTimeRemainingMs ?? 1;
  }

  push(task: () => void): void {
    this.tasks.push(task);
    this.schedule();
  }

  get size(): number {
    return this.tasks.length;
  }

  clear(): void {
    this.tasks.length = 0;
    if (this.handle !== null) {
      cic(this.handle);
      this.handle = null;
    }
  }

  private schedule(): void {
    if (this.handle !== null || this.tasks.length === 0) return;
    this.handle = ric((deadline) => {
      this.handle = null;
      while (
        this.tasks.length > 0 &&
        (deadline.didTimeout || deadline.timeRemaining() > this.minTimeRemainingMs)
      ) {
        const task = this.tasks.shift();
        if (!task) break;
        try {
          task();
        } catch {
          // never let one task break the queue
        }
      }
      if (this.tasks.length > 0) this.schedule();
    }, { timeout: this.timeoutMs });
  }
}
