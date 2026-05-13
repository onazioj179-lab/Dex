// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Longest Increasing Subsequence via patience sorting in O(n log n).
 * Returns one valid LIS (not all) along with its length.
 */

function lowerBound(arr: number[], target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface LisResult<T> {
  length: number;
  sequence: T[];
  indices: number[];
}

export function longestIncreasingSubsequence<T>(
  values: readonly T[],
  compare: (a: T, b: T) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
): LisResult<T> {
  const n = values.length;
  if (n === 0) return { length: 0, sequence: [], indices: [] };
  const tails: number[] = []; // indices into values
  const prev = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    // Binary search position where values[i] would replace
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(values[tails[mid]!]!, values[i]!) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }
  const indices: number[] = [];
  let cur = tails[tails.length - 1]!;
  while (cur !== -1) {
    indices.push(cur);
    cur = prev[cur]!;
  }
  indices.reverse();
  return {
    length: indices.length,
    sequence: indices.map((i) => values[i]!),
    indices,
  };
}

// Silence unused-variable warning for lowerBound (kept as helper for potential future use).
void lowerBound;
