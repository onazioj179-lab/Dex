// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cooperative priority job scheduler. Higher priority numbers run first.
 * Jobs run sequentially through a microtask loop; failures do not block
 * other jobs.
 */

export interface PriorityJob<T> {
  priority: number;
  run: () => Promise<T> | T;
}

export class PriorityScheduler {
  private readonly heap: { priority: number; seq: number; resolve: (v: unknown) => void; reject: (e: unknown) => void; run: () => Promise<unknown> | unknown }[] = [];
  private seqCounter = 0;
  private running = false;

  schedule<T>(job: PriorityJob<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.heap.push({
        priority: job.priority,
        seq: this.seqCounter++,
        resolve: resolve as (v: unknown) => void,
        reject,
        run: job.run,
      });
      this.up(this.heap.length - 1);
      if (!this.running) void this.drain();
    });
  }

  size(): number { return this.heap.length; }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.heap.length > 0) {
        const job = this.popTop();
        if (!job) break;
        try {
          const result = await job.run();
          job.resolve(result);
        } catch (err) {
          job.reject(err);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private popTop(): { resolve: (v: unknown) => void; reject: (e: unknown) => void; run: () => Promise<unknown> | unknown } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) { this.heap[0] = last; this.down(0); }
    return top;
  }

  private cmp(a: { priority: number; seq: number }, b: { priority: number; seq: number }): number {
    if (a.priority !== b.priority) return b.priority - a.priority; // higher priority first
    return a.seq - b.seq; // FIFO within same priority
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (this.cmp(this.heap[i]!, this.heap[p]!) < 0) {
        [this.heap[i], this.heap[p]] = [this.heap[p]!, this.heap[i]!];
        i = p;
      } else break;
    }
  }

  private down(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = i * 2 + 1; const r = l + 1; let s = i;
      if (l < n && this.cmp(this.heap[l]!, this.heap[s]!) < 0) s = l;
      if (r < n && this.cmp(this.heap[r]!, this.heap[s]!) < 0) s = r;
      if (s === i) break;
      [this.heap[i], this.heap[s]] = [this.heap[s]!, this.heap[i]!];
      i = s;
    }
  }
}
