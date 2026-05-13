// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Binary-heap min-priority queue. Used by the worker pool scheduler,
 * notification ordering, and graph layout step queues.
 *
 * Lower priority value = higher priority (pop first).
 */

export class PriorityQueue<T> {
  private heap: Array<{ p: number; v: T }> = [];

  size(): number { return this.heap.length; }
  peek(): T | undefined { return this.heap[0]?.v; }
  clear(): void { this.heap.length = 0; }

  push(value: T, priority: number): void {
    this.heap.push({ p: priority, v: value });
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top.v;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].p <= this.heap[i].p) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = i * 2 + 1, r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.heap[l].p < this.heap[smallest].p) smallest = l;
      if (r < n && this.heap[r].p < this.heap[smallest].p) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}
