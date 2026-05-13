// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sparse Table - O(n log n) preprocessing, O(1) range min/max query for
 * idempotent operations. Backing array is immutable after build.
 */

export class SparseTable {
  private readonly table: number[][];
  private readonly log: Int32Array;
  private readonly combine: (a: number, b: number) => number;

  constructor(values: readonly number[], combine: (a: number, b: number) => number = Math.min) {
    const n = values.length;
    if (n === 0) throw new Error('values must not be empty');
    this.combine = combine;
    this.log = new Int32Array(n + 1);
    for (let i = 2; i <= n; i += 1) this.log[i] = this.log[i >> 1]! + 1;
    const k = this.log[n]! + 1;
    this.table = [];
    this.table.push(values.slice());
    for (let j = 1; j < k; j += 1) {
      const prev = this.table[j - 1]!;
      const len = 1 << j;
      const half = 1 << (j - 1);
      const row: number[] = new Array(n - len + 1);
      for (let i = 0; i + len <= n; i += 1) {
        row[i] = combine(prev[i]!, prev[i + half]!);
      }
      this.table.push(row);
    }
  }

  /** Inclusive range query on [lo, hi]. */
  query(lo: number, hi: number): number {
    if (lo > hi) throw new Error('lo must be <= hi');
    const j = this.log[hi - lo + 1]!;
    return this.combine(this.table[j]![lo]!, this.table[j]![hi - (1 << j) + 1]!);
  }
}
