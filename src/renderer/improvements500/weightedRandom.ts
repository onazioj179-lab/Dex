// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Weighted random sampling. Builds a cumulative weight table once for
 * O(log n) draws via binary search.
 */

export interface WeightedItem<T> { item: T; weight: number }

export class WeightedRandom<T> {
  private readonly items: T[];
  private readonly cumulative: number[];
  private readonly total: number;
  private readonly rand: () => number;

  constructor(entries: ReadonlyArray<WeightedItem<T>>, random?: () => number) {
    if (entries.length === 0) throw new Error('WeightedRandom: at least one entry required');
    this.items = [];
    this.cumulative = [];
    let sum = 0;
    for (const e of entries) {
      if (!Number.isFinite(e.weight) || e.weight < 0) {
        throw new Error('WeightedRandom: weights must be non-negative finite numbers');
      }
      sum += e.weight;
      this.items.push(e.item);
      this.cumulative.push(sum);
    }
    if (sum <= 0) throw new Error('WeightedRandom: total weight must be > 0');
    this.total = sum;
    this.rand = random ?? Math.random;
  }

  pick(): T {
    const target = this.rand() * this.total;
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.cumulative[mid] ?? 0) < target) lo = mid + 1; else hi = mid;
    }
    return this.items[lo]!;
  }

  pickN(n: number): T[] {
    const out: T[] = new Array(n);
    for (let i = 0; i < n; i += 1) out[i] = this.pick();
    return out;
  }
}
