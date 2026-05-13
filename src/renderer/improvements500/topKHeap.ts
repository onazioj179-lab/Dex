// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Streaming top-K via min-heap. Tracks the K largest items seen so far
 * by user-supplied scoring function in O(log K) per push.
 */

export class TopKHeap<T> {
  private readonly k: number;
  private readonly heap: T[] = [];
  private readonly score: (item: T) => number;

  constructor(k: number, score: (item: T) => number) {
    if (!Number.isInteger(k) || k <= 0) throw new Error('TopKHeap: k must be a positive integer');
    this.k = k;
    this.score = score;
  }

  push(item: T): void {
    if (this.heap.length < this.k) {
      this.heap.push(item);
      this.up(this.heap.length - 1);
      return;
    }
    if (this.score(item) <= this.score(this.heap[0]!)) return;
    this.heap[0] = item;
    this.down(0);
  }

  values(): T[] {
    return this.heap.slice().sort((a, b) => this.score(b) - this.score(a));
  }

  size(): number { return this.heap.length; }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >>> 1;
      if (this.score(this.heap[i]!) < this.score(this.heap[p]!)) {
        [this.heap[i], this.heap[p]] = [this.heap[p]!, this.heap[i]!];
        i = p;
      } else break;
    }
  }

  private down(i: number): void {
    const n = this.heap.length;
    while (true) {
      const l = i * 2 + 1; const r = l + 1; let s = i;
      if (l < n && this.score(this.heap[l]!) < this.score(this.heap[s]!)) s = l;
      if (r < n && this.score(this.heap[r]!) < this.score(this.heap[s]!)) s = r;
      if (s === i) break;
      [this.heap[i], this.heap[s]] = [this.heap[s]!, this.heap[i]!];
      i = s;
    }
  }
}
