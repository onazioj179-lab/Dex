// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Segment tree for range queries with arbitrary associative combiner.
 * O(log n) point update and range query.
 */

export interface SegmentTreeOptions<T> {
  identity: T;
  combine: (a: T, b: T) => T;
}

export class SegmentTree<T> {
  private readonly n: number;
  private readonly tree: T[];
  private readonly identity: T;
  private readonly combine: (a: T, b: T) => T;

  constructor(values: readonly T[], opts: SegmentTreeOptions<T>) {
    this.n = values.length;
    this.identity = opts.identity;
    this.combine = opts.combine;
    this.tree = new Array<T>(this.n * 4).fill(opts.identity);
    if (this.n > 0) this.build(1, 0, this.n - 1, values);
  }

  private build(node: number, lo: number, hi: number, vals: readonly T[]): void {
    if (lo === hi) {
      this.tree[node] = vals[lo]!;
      return;
    }
    const mid = (lo + hi) >> 1;
    this.build(node * 2, lo, mid, vals);
    this.build(node * 2 + 1, mid + 1, hi, vals);
    this.tree[node] = this.combine(this.tree[node * 2]!, this.tree[node * 2 + 1]!);
  }

  /** Update value at index. */
  set(index: number, value: T): void {
    if (index < 0 || index >= this.n) throw new RangeError('index out of bounds');
    this.update(1, 0, this.n - 1, index, value);
  }

  private update(node: number, lo: number, hi: number, index: number, value: T): void {
    if (lo === hi) {
      this.tree[node] = value;
      return;
    }
    const mid = (lo + hi) >> 1;
    if (index <= mid) this.update(node * 2, lo, mid, index, value);
    else this.update(node * 2 + 1, mid + 1, hi, index, value);
    this.tree[node] = this.combine(this.tree[node * 2]!, this.tree[node * 2 + 1]!);
  }

  /** Inclusive range query over [start, end]. */
  query(start: number, end: number): T {
    if (this.n === 0) return this.identity;
    if (start < 0 || end >= this.n || start > end) throw new RangeError('range out of bounds');
    return this.queryNode(1, 0, this.n - 1, start, end);
  }

  private queryNode(node: number, lo: number, hi: number, start: number, end: number): T {
    if (start <= lo && hi <= end) return this.tree[node]!;
    const mid = (lo + hi) >> 1;
    if (end <= mid) return this.queryNode(node * 2, lo, mid, start, end);
    if (start > mid) return this.queryNode(node * 2 + 1, mid + 1, hi, start, end);
    return this.combine(
      this.queryNode(node * 2, lo, mid, start, end),
      this.queryNode(node * 2 + 1, mid + 1, hi, start, end),
    );
  }
}
