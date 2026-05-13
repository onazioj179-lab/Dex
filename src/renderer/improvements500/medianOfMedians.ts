// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Median-of-medians selection: deterministic O(n) k-th smallest.
 * Slower than quickSelect in practice but with worst-case linear time.
 */

function medianOfFive(a: number[]): number {
  const sorted = a.slice().sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function partition(arr: number[], lo: number, hi: number, pivot: number): number {
  let pivotIdx = lo;
  for (let i = lo; i <= hi; i += 1) {
    if (arr[i] === pivot) {
      pivotIdx = i;
      break;
    }
  }
  [arr[pivotIdx], arr[hi]] = [arr[hi]!, arr[pivotIdx]!];
  let store = lo;
  for (let i = lo; i < hi; i += 1) {
    if (arr[i]! < pivot) {
      [arr[store], arr[i]] = [arr[i]!, arr[store]!];
      store += 1;
    }
  }
  [arr[store], arr[hi]] = [arr[hi]!, arr[store]!];
  return store;
}

function selectInner(arr: number[], lo: number, hi: number, k: number): number {
  while (true) {
    if (lo === hi) return arr[lo]!;
    // Group into chunks of 5, find median of each, then median of medians
    const medians: number[] = [];
    for (let i = lo; i <= hi; i += 5) {
      const end = Math.min(i + 4, hi);
      medians.push(medianOfFive(arr.slice(i, end + 1)));
    }
    const pivot = medians.length === 1
      ? medians[0]!
      : selectInner(medians, 0, medians.length - 1, Math.floor(medians.length / 2));
    const p = partition(arr, lo, hi, pivot);
    if (k === p) return arr[k]!;
    if (k < p) hi = p - 1;
    else lo = p + 1;
  }
}

export function medianOfMediansSelect(items: ReadonlyArray<number>, k: number): number {
  if (!Number.isInteger(k) || k < 0 || k >= items.length) {
    throw new RangeError('medianOfMediansSelect: k out of range');
  }
  const arr = items.slice();
  return selectInner(arr, 0, arr.length - 1, k);
}
