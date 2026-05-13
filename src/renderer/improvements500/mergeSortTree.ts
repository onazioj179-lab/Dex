// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
function mergeSortedAsc(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) out[k++] = a[i++];
    else out[k++] = b[j++];
  }
  while (i < a.length) out[k++] = a[i++];
  while (j < b.length) out[k++] = b[j++];
  return out;
}

export class MergeSortTree {
  private readonly n: number;
  private readonly tree: number[][];

  constructor(arr: ReadonlyArray<number>) {
    this.n = arr.length;
    this.tree = new Array(4 * Math.max(1, this.n));
    if (this.n > 0) this.build(1, 0, this.n - 1, arr);
  }

  private build(node: number, l: number, r: number, arr: ReadonlyArray<number>): void {
    if (l === r) {
      this.tree[node] = [arr[l]];
      return;
    }
    const m = (l + r) >> 1;
    this.build(node * 2, l, m, arr);
    this.build(node * 2 + 1, m + 1, r, arr);
    this.tree[node] = mergeSortedAsc(this.tree[node * 2], this.tree[node * 2 + 1]);
  }

  private countLeq(sorted: number[], x: number): number {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  countLeqRange(l: number, r: number, x: number): number {
    return this.query(1, 0, this.n - 1, l, r, x);
  }

  private query(node: number, nl: number, nr: number, l: number, r: number, x: number): number {
    if (r < nl || nr < l) return 0;
    if (l <= nl && nr <= r) return this.countLeq(this.tree[node], x);
    const m = (nl + nr) >> 1;
    return (
      this.query(node * 2, nl, m, l, r, x) + this.query(node * 2 + 1, m + 1, nr, l, r, x)
    );
  }
}
