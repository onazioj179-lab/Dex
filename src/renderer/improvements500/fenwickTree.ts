// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fenwick (Binary Indexed) Tree for prefix-sum range queries with
 * O(log n) point updates. 1-indexed internally; exposes 0-indexed API.
 */

export class FenwickTree {
  private readonly tree: Float64Array;
  private readonly n: number;

  constructor(size: number) {
    if (size < 0) throw new Error('size must be non-negative');
    this.n = size;
    this.tree = new Float64Array(size + 1);
  }

  /** Add delta to index i. */
  update(i: number, delta: number): void {
    if (i < 0 || i >= this.n) throw new RangeError('index out of bounds');
    let x = i + 1;
    while (x <= this.n) {
      this.tree[x] = this.tree[x]! + delta;
      x += x & -x;
    }
  }

  /** Prefix sum over [0, i] inclusive. */
  prefixSum(i: number): number {
    if (i < -1 || i >= this.n) throw new RangeError('index out of bounds');
    let x = i + 1;
    let s = 0;
    while (x > 0) {
      s += this.tree[x]!;
      x -= x & -x;
    }
    return s;
  }

  /** Range sum over [lo, hi] inclusive. */
  rangeSum(lo: number, hi: number): number {
    return this.prefixSum(hi) - this.prefixSum(lo - 1);
  }

  get size(): number {
    return this.n;
  }
}
