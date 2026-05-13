// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 1D interval set operations: merge overlapping, subtract, intersect.
 */

export interface Interval1D {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent intervals; returns sorted disjoint set. */
export function mergeIntervals(intervals: readonly Interval1D[]): Interval1D[] {
  if (intervals.length === 0) return [];
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const out: Interval1D[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Subtract `b` from `a`. Inputs need not be merged; result is merged disjoint. */
export function subtractIntervals(a: readonly Interval1D[], b: readonly Interval1D[]): Interval1D[] {
  let result = mergeIntervals(a);
  const subs = mergeIntervals(b);
  for (const s of subs) {
    const next: Interval1D[] = [];
    for (const r of result) {
      if (s.end <= r.start || s.start >= r.end) {
        next.push(r);
        continue;
      }
      if (s.start > r.start) next.push({ start: r.start, end: Math.min(r.end, s.start) });
      if (s.end < r.end) next.push({ start: Math.max(r.start, s.end), end: r.end });
    }
    result = next;
  }
  return result;
}

/** Intersect two interval sets. */
export function intersectIntervals(a: readonly Interval1D[], b: readonly Interval1D[]): Interval1D[] {
  const A = mergeIntervals(a);
  const B = mergeIntervals(b);
  const out: Interval1D[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i]!.start, B[j]!.start);
    const hi = Math.min(A[i]!.end, B[j]!.end);
    if (lo < hi) out.push({ start: lo, end: hi });
    if (A[i]!.end < B[j]!.end) i += 1;
    else j += 1;
  }
  return out;
}
