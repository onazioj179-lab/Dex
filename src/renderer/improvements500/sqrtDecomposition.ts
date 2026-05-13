// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Square-root decomposition for range-sum queries with point updates.
 * O(sqrt n) per query and O(1) per point update.
 */

export class SqrtDecomposition {
  private values: Float64Array;
  private blocks: Float64Array;
  private blockSize: number;

  constructor(input: ArrayLike<number>) {
    const n = input.length;
    this.values = new Float64Array(n);
    this.blockSize = Math.max(1, Math.floor(Math.sqrt(Math.max(1, n))));
    const blockCount = Math.ceil(n / this.blockSize);
    this.blocks = new Float64Array(blockCount);
    for (let i = 0; i < n; i += 1) {
      this.values[i] = input[i]!;
      this.blocks[Math.floor(i / this.blockSize)] += input[i]!;
    }
  }

  /** Set values[index] = newValue. */
  pointUpdate(index: number, newValue: number): void {
    const block = Math.floor(index / this.blockSize);
    this.blocks[block] = this.blocks[block]! + (newValue - this.values[index]!);
    this.values[index] = newValue;
  }

  /** Sum of values in [lo, hi). */
  rangeSum(lo: number, hi: number): number {
    let sum = 0;
    const startBlock = Math.floor(lo / this.blockSize);
    const endBlock = Math.floor((hi - 1) / this.blockSize);
    if (startBlock === endBlock) {
      for (let i = lo; i < hi; i += 1) sum += this.values[i]!;
      return sum;
    }
    const startBlockEnd = (startBlock + 1) * this.blockSize;
    for (let i = lo; i < startBlockEnd; i += 1) sum += this.values[i]!;
    for (let b = startBlock + 1; b < endBlock; b += 1) sum += this.blocks[b]!;
    const endBlockStart = endBlock * this.blockSize;
    for (let i = endBlockStart; i < hi; i += 1) sum += this.values[i]!;
    return sum;
  }
}
