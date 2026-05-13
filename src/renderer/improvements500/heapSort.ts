// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * In-place heapsort. Stable for performance-sensitive paths where Array.sort
 * polymorphism penalties matter; default ascending with optional comparator.
 */

export type Comparator<T> = (a: T, b: T) => number;

function defaultCompare<T>(a: T, b: T): number {
  if (a === b) return 0;
  return (a as unknown as number) < (b as unknown as number) ? -1 : 1;
}

function siftDown<T>(arr: T[], start: number, end: number, cmp: Comparator<T>): void {
  let root = start;
  while (true) {
    const child = 2 * root + 1;
    if (child > end) return;
    let swap = root;
    if (cmp(arr[swap], arr[child]) < 0) swap = child;
    if (child + 1 <= end && cmp(arr[swap], arr[child + 1]) < 0) swap = child + 1;
    if (swap === root) return;
    const tmp = arr[root];
    arr[root] = arr[swap];
    arr[swap] = tmp;
    root = swap;
  }
}

function heapify<T>(arr: T[], cmp: Comparator<T>): void {
  const n = arr.length;
  for (let start = Math.floor(n / 2) - 1; start >= 0; start -= 1) {
    siftDown(arr, start, n - 1, cmp);
  }
}

export function heapSort<T>(arr: T[], cmp: Comparator<T> = defaultCompare): T[] {
  const n = arr.length;
  if (n < 2) return arr;
  heapify(arr, cmp);
  for (let end = n - 1; end > 0; end -= 1) {
    const tmp = arr[0];
    arr[0] = arr[end];
    arr[end] = tmp;
    siftDown(arr, 0, end - 1, cmp);
  }
  return arr;
}

/** Returns the k smallest elements in ascending order. */
export function partialHeapSort<T>(arr: readonly T[], k: number, cmp: Comparator<T> = defaultCompare): T[] {
  if (k <= 0) return [];
  const out = arr.slice();
  heapSort(out, cmp);
  return out.slice(0, k);
}
