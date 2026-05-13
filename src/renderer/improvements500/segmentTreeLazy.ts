// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Segment tree with lazy propagation supporting range-add updates and
 * range-sum queries on numeric arrays. O(log n) per operation.
 */

export class SegmentTreeLazy {
  private n: number;
  private tree: Float64Array;
  private lazy: Float64Array;
  private size: number; // padded length (power of 2)

  constructor(values: ArrayLike<number>) {
    this.n = values.length;
    let size = 1;
    while (size < Math.max(1, this.n)) size <<= 1;
    this.size = size;
    this.tree = new Float64Array(size * 2);
    this.lazy = new Float64Array(size * 2);
    for (let i = 0; i < this.n; i += 1) this.tree[size + i] = values[i]!;
    for (let i = size - 1; i >= 1; i -= 1) this.tree[i] = this.tree[2 * i]! + this.tree[2 * i + 1]!;
  }

  private apply(node: number, value: number, span: number): void {
    this.tree[node] = this.tree[node]! + value * span;
    this.lazy[node] = this.lazy[node]! + value;
  }

  private push(node: number, span: number): void {
    if (this.lazy[node] !== 0) {
      this.apply(2 * node, this.lazy[node]!, span >> 1);
      this.apply(2 * node + 1, this.lazy[node]!, span >> 1);
      this.lazy[node] = 0;
    }
  }

  private updateRange(node: number, nodeLo: number, nodeHi: number, lo: number, hi: number, value: number): void {
    if (hi <= nodeLo || nodeHi <= lo) return;
    if (lo <= nodeLo && nodeHi <= hi) {
      this.apply(node, value, nodeHi - nodeLo);
      return;
    }
    this.push(node, nodeHi - nodeLo);
    const mid = (nodeLo + nodeHi) >> 1;
    this.updateRange(2 * node, nodeLo, mid, lo, hi, value);
    this.updateRange(2 * node + 1, mid, nodeHi, lo, hi, value);
    this.tree[node] = this.tree[2 * node]! + this.tree[2 * node + 1]!;
  }

  private queryRange(node: number, nodeLo: number, nodeHi: number, lo: number, hi: number): number {
    if (hi <= nodeLo || nodeHi <= lo) return 0;
    if (lo <= nodeLo && nodeHi <= hi) return this.tree[node]!;
    this.push(node, nodeHi - nodeLo);
    const mid = (nodeLo + nodeHi) >> 1;
    return this.queryRange(2 * node, nodeLo, mid, lo, hi) + this.queryRange(2 * node + 1, mid, nodeHi, lo, hi);
  }

  /** Add `value` to every element in [lo, hi). */
  rangeAdd(lo: number, hi: number, value: number): void {
    this.updateRange(1, 0, this.size, lo, hi, value);
  }

  /** Sum of elements in [lo, hi). */
  rangeSum(lo: number, hi: number): number {
    return this.queryRange(1, 0, this.size, lo, hi);
  }
}
