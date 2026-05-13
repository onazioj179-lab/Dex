// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * In-place quicksort with median-of-three pivot selection and insertion-sort
 * cutoff for small partitions. Stable comparator semantics.
 */

const INSERTION_CUTOFF = 12;

import type { Comparator } from './heapSort';

export function quickSort<T>(arr: T[], cmp?: Comparator<T>): T[] {
  const c = cmp ?? defaultCompare;
  sort(arr, 0, arr.length - 1, c);
  return arr;
}

function defaultCompare<T>(a: T, b: T): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sort<T>(arr: T[], lo: number, hi: number, cmp: Comparator<T>): void {
  while (hi - lo > INSERTION_CUTOFF) {
    const p = partition(arr, lo, hi, cmp);
    // Recurse into smaller side, iterate the larger one
    if (p - lo < hi - p) {
      sort(arr, lo, p - 1, cmp);
      lo = p + 1;
    } else {
      sort(arr, p + 1, hi, cmp);
      hi = p - 1;
    }
  }
  insertionSort(arr, lo, hi, cmp);
}

function partition<T>(arr: T[], lo: number, hi: number, cmp: Comparator<T>): number {
  const mid = (lo + hi) >>> 1;
  // Median of three: lo, mid, hi -> sort and use mid as pivot
  if (cmp(arr[lo]!, arr[mid]!) > 0) swap(arr, lo, mid);
  if (cmp(arr[lo]!, arr[hi]!) > 0) swap(arr, lo, hi);
  if (cmp(arr[mid]!, arr[hi]!) > 0) swap(arr, mid, hi);
  swap(arr, mid, hi - 1);
  const pivot = arr[hi - 1]!;
  let i = lo;
  let j = hi - 1;
  while (true) {
    do { i += 1; } while (cmp(arr[i]!, pivot) < 0);
    do { j -= 1; } while (cmp(arr[j]!, pivot) > 0);
    if (i >= j) break;
    swap(arr, i, j);
  }
  swap(arr, i, hi - 1);
  return i;
}

function insertionSort<T>(arr: T[], lo: number, hi: number, cmp: Comparator<T>): void {
  for (let i = lo + 1; i <= hi; i += 1) {
    const v = arr[i]!;
    let j = i - 1;
    while (j >= lo && cmp(arr[j]!, v) > 0) {
      arr[j + 1] = arr[j]!;
      j -= 1;
    }
    arr[j + 1] = v;
  }
}

function swap<T>(arr: T[], i: number, j: number): void {
  const t = arr[i]!;
  arr[i] = arr[j]!;
  arr[j] = t;
}
