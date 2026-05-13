// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Quickselect: returns the k-th smallest element (0-indexed) in
 * O(n) average time. Operates on a copy; original array untouched.
 */

export function quickSelect(items: ReadonlyArray<number>, k: number): number {
  if (!Number.isInteger(k) || k < 0 || k >= items.length) {
    throw new RangeError('quickSelect: k out of range');
  }
  const arr = items.slice();
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    // Median-of-three pivot for robustness
    const mid = (lo + hi) >> 1;
    if (arr[lo]! > arr[mid]!) [arr[lo], arr[mid]] = [arr[mid]!, arr[lo]!];
    if (arr[lo]! > arr[hi]!) [arr[lo], arr[hi]] = [arr[hi]!, arr[lo]!];
    if (arr[mid]! > arr[hi]!) [arr[mid], arr[hi]] = [arr[hi]!, arr[mid]!];
    const pivot = arr[mid]!;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (arr[i]! < pivot) i += 1;
      while (arr[j]! > pivot) j -= 1;
      if (i <= j) {
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return arr[k]!;
}
