// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Binary search helpers. Array MUST be sorted ascending per the comparator.
 */

export type SearchComparator<T, U = T> = (item: T, target: U) => number;

export function binarySearch<T>(arr: readonly T[], target: T, cmp?: SearchComparator<T, T>): number {
  const c = cmp ?? defaultCompare;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = c(arr[mid]!, target);
    if (r === 0) return mid;
    if (r < 0) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

/** First index where arr[i] >= target. arr.length if no such index. */
export function lowerBound<T, U = T>(arr: readonly T[], target: U, cmp?: SearchComparator<T, U>): number {
  const c = cmp ?? (defaultCompare as unknown as SearchComparator<T, U>);
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (c(arr[mid]!, target) < 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** First index where arr[i] > target. arr.length if no such index. */
export function upperBound<T, U = T>(arr: readonly T[], target: U, cmp?: SearchComparator<T, U>): number {
  const c = cmp ?? (defaultCompare as unknown as SearchComparator<T, U>);
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (c(arr[mid]!, target) <= 0) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function defaultCompare<T>(a: T, b: T): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
