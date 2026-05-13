// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Simple unbalanced interval tree for half-open [start, end) intervals.
 * Build once, query many. O(n log n) build, O(log n + k) point/range queries.
 */

export interface Interval<T = unknown> {
  start: number;
  end: number;
  value: T;
}

interface Node<T> {
  center: number;
  left: Node<T> | null;
  right: Node<T> | null;
  /** Intervals overlapping `center`, sorted by start ascending. */
  byStart: Array<Interval<T>>;
  /** Same intervals sorted by end descending. */
  byEnd: Array<Interval<T>>;
}

function buildNode<T>(items: Array<Interval<T>>): Node<T> | null {
  if (items.length === 0) return null;
  const mids = items.map((i) => (i.start + i.end) / 2).sort((a, b) => a - b);
  const center = mids[Math.floor(mids.length / 2)];
  const overlap: Array<Interval<T>> = [];
  const left: Array<Interval<T>> = [];
  const right: Array<Interval<T>> = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.end <= center) left.push(it);
    else if (it.start > center) right.push(it);
    else overlap.push(it);
  }
  return {
    center,
    left: buildNode(left),
    right: buildNode(right),
    byStart: overlap.slice().sort((a, b) => a.start - b.start),
    byEnd: overlap.slice().sort((a, b) => b.end - a.end),
  };
}

export class IntervalTree<T = unknown> {
  private readonly root: Node<T> | null;

  constructor(intervals: ReadonlyArray<Interval<T>>) {
    for (let i = 0; i < intervals.length; i += 1) {
      const it = intervals[i];
      if (!(it.end > it.start)) {
        throw new Error('IntervalTree: end must be > start');
      }
    }
    this.root = buildNode(intervals.slice());
  }

  /** All intervals containing point p (start <= p < end). */
  queryPoint(p: number): Array<Interval<T>> {
    const out: Array<Interval<T>> = [];
    this.collectPoint(this.root, p, out);
    return out;
  }

  /** All intervals overlapping [start, end). */
  queryRange(start: number, end: number): Array<Interval<T>> {
    if (!(end > start)) return [];
    const out: Array<Interval<T>> = [];
    this.collectRange(this.root, start, end, out);
    return out;
  }

  private collectPoint(node: Node<T> | null, p: number, out: Array<Interval<T>>): void {
    if (!node) return;
    if (p < node.center) {
      for (let i = 0; i < node.byStart.length; i += 1) {
        const it = node.byStart[i];
        if (it.start > p) break;
        if (it.end > p) out.push(it);
      }
      this.collectPoint(node.left, p, out);
    } else if (p > node.center) {
      for (let i = 0; i < node.byEnd.length; i += 1) {
        const it = node.byEnd[i];
        if (it.end <= p) break;
        if (it.start <= p) out.push(it);
      }
      this.collectPoint(node.right, p, out);
    } else {
      for (let i = 0; i < node.byStart.length; i += 1) out.push(node.byStart[i]);
      this.collectPoint(node.left, p, out);
      this.collectPoint(node.right, p, out);
    }
  }

  private collectRange(
    node: Node<T> | null,
    start: number,
    end: number,
    out: Array<Interval<T>>,
  ): void {
    if (!node) return;
    for (let i = 0; i < node.byStart.length; i += 1) {
      const it = node.byStart[i];
      if (it.start >= end) break;
      if (it.end > start) out.push(it);
    }
    if (start < node.center) this.collectRange(node.left, start, end, out);
    if (end > node.center) this.collectRange(node.right, start, end, out);
  }
}
