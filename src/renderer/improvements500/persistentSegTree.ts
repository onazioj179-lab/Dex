// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Persistent segment tree supporting point updates that yield a new
 * version while preserving prior versions. Range-sum queries on any
 * version in O(log n).
 */

interface PNode {
  sum: number;
  left: PNode | null;
  right: PNode | null;
}

function build(lo: number, hi: number, values: ArrayLike<number>): PNode {
  if (hi - lo === 1) return { sum: values[lo] ?? 0, left: null, right: null };
  const mid = (lo + hi) >> 1;
  const left = build(lo, mid, values);
  const right = build(mid, hi, values);
  return { sum: left.sum + right.sum, left, right };
}

function updateNode(node: PNode, lo: number, hi: number, idx: number, val: number): PNode {
  if (hi - lo === 1) return { sum: val, left: null, right: null };
  const mid = (lo + hi) >> 1;
  if (idx < mid) {
    const left = updateNode(node.left!, lo, mid, idx, val);
    return { sum: left.sum + node.right!.sum, left, right: node.right };
  } else {
    const right = updateNode(node.right!, mid, hi, idx, val);
    return { sum: node.left!.sum + right.sum, left: node.left, right };
  }
}

function queryNode(node: PNode, lo: number, hi: number, ql: number, qh: number): number {
  if (qh <= lo || hi <= ql) return 0;
  if (ql <= lo && hi <= qh) return node.sum;
  const mid = (lo + hi) >> 1;
  return queryNode(node.left!, lo, mid, ql, qh) + queryNode(node.right!, mid, hi, ql, qh);
}

export class PersistentSegmentTree {
  private size: number;
  private versions: PNode[] = [];

  constructor(values: ArrayLike<number>) {
    this.size = Math.max(1, values.length);
    const padded =
      values.length >= 1
        ? values
        : ({ length: 1, 0: 0 } as unknown as ArrayLike<number>);
    this.versions.push(build(0, this.size, padded));
  }

  /** Number of versions stored (initial = version 0). */
  get versionCount(): number {
    return this.versions.length;
  }

  /** Create new version derived from `baseVersion` with values[index] = newValue. Returns new version index. */
  update(baseVersion: number, index: number, newValue: number): number {
    const newRoot = updateNode(this.versions[baseVersion]!, 0, this.size, index, newValue);
    this.versions.push(newRoot);
    return this.versions.length - 1;
  }

  /** Range-sum on a version. */
  rangeSum(version: number, lo: number, hi: number): number {
    return queryNode(this.versions[version]!, 0, this.size, lo, hi);
  }
}
