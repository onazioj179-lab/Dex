// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * LSD radix sort for non-negative 32-bit integers.
 * O(n) for fixed-width keys; faster than comparison sorts when n is large
 * and values fit in uint32. Returns a new array.
 */

export function radixSort(arr: readonly number[]): number[] {
  for (const v of arr) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
      throw new Error('radixSort: values must be 32-bit non-negative integers');
    }
  }
  if (arr.length <= 1) return arr.slice();
  let cur: number[] = arr.slice();
  let next: number[] = new Array(arr.length);
  for (let shift = 0; shift < 32; shift += 8) {
    const counts = new Array<number>(256).fill(0);
    for (let i = 0; i < cur.length; i += 1) {
      const byte = (cur[i]! >>> shift) & 0xff;
      counts[byte] = (counts[byte] ?? 0) + 1;
    }
    let total = 0;
    for (let b = 0; b < 256; b += 1) {
      const c = counts[b] ?? 0;
      counts[b] = total;
      total += c;
    }
    for (let i = 0; i < cur.length; i += 1) {
      const byte = (cur[i]! >>> shift) & 0xff;
      const idx = counts[byte] ?? 0;
      next[idx] = cur[i]!;
      counts[byte] = idx + 1;
    }
    const tmp = cur; cur = next; next = tmp;
  }
  return cur;
}
