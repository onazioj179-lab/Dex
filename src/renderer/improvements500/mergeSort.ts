// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Stable merge sort. Returns a new array; original is not mutated.
 * Use this when stability matters (e.g. sorting by secondary key).
 */

import type { Comparator } from './heapSort';

export function mergeSort<T>(arr: readonly T[], cmp?: Comparator<T>): T[] {
  const c = cmp ?? ((a: T, b: T) => (a === b ? 0 : a < b ? -1 : 1));
  if (arr.length <= 1) return arr.slice();
  const out = arr.slice();
  const buf: T[] = new Array(out.length);
  msort(out, buf, 0, out.length, c);
  return out;
}

function msort<T>(arr: T[], buf: T[], lo: number, hi: number, cmp: Comparator<T>): void {
  if (hi - lo <= 1) return;
  const mid = (lo + hi) >>> 1;
  msort(arr, buf, lo, mid, cmp);
  msort(arr, buf, mid, hi, cmp);
  merge(arr, buf, lo, mid, hi, cmp);
}

function merge<T>(arr: T[], buf: T[], lo: number, mid: number, hi: number, cmp: Comparator<T>): void {
  let i = lo;
  let j = mid;
  let k = lo;
  while (i < mid && j < hi) {
    if (cmp(arr[i]!, arr[j]!) <= 0) {
      buf[k++] = arr[i++]!;
    } else {
      buf[k++] = arr[j++]!;
    }
  }
  while (i < mid) buf[k++] = arr[i++]!;
  while (j < hi) buf[k++] = arr[j++]!;
  for (let n = lo; n < hi; n += 1) arr[n] = buf[n]!;
}
