// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * BatchScheduler collects items pushed within a short window and flushes them
 * to a single batch handler. Useful for coalescing analytics, network writes,
 * or render invalidations.
 */

export interface BatchSchedulerOptions<T> {
  windowMs: number;
  maxBatch?: number;
  onFlush: (batch: T[]) => void | Promise<void>;
}

export class BatchScheduler<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly windowMs: number;
  private readonly maxBatch: number;
  private readonly onFlush: (batch: T[]) => void | Promise<void>;

  constructor(opts: BatchSchedulerOptions<T>) {
    if (!Number.isFinite(opts.windowMs) || opts.windowMs < 0) {
      throw new Error('BatchScheduler: windowMs must be a non-negative finite number');
    }
    if (typeof opts.onFlush !== 'function') {
      throw new Error('BatchScheduler: onFlush must be a function');
    }
    this.windowMs = opts.windowMs;
    this.maxBatch = opts.maxBatch ?? Infinity;
    this.onFlush = opts.onFlush;
  }

  push(item: T): void {
    this.buffer.push(item);
    if (this.buffer.length >= this.maxBatch) {
      this.flush();
      return;
    }
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.windowMs);
    }
  }

  flush(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    void this.onFlush(batch);
  }

  get size(): number {
    return this.buffer.length;
  }

  clear(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.buffer = [];
  }
}
