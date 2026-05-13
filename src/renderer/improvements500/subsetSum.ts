// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Subset-sum: returns true if some subset of `items` sums exactly to
 * `target`. Bitset DP in O(n * target / 32).
 */

export function subsetSum(items: ReadonlyArray<number>, target: number): boolean {
  if (!Number.isInteger(target) || target < 0) {
    throw new Error('subsetSum: target must be non-negative integer');
  }
  for (const v of items) {
    if (!Number.isInteger(v) || v < 0) throw new Error('subsetSum: items must be non-negative integers');
  }
  const wordCount = (target >>> 5) + 1;
  const bits = new Uint32Array(wordCount);
  bits[0] = 1; // sum = 0 reachable
  for (const v of items) {
    if (v === 0) continue;
    if (v > target) continue;
    // Shift bitset left by v and OR into itself
    const wordShift = v >>> 5;
    const bitShift = v & 31;
    if (bitShift === 0) {
      for (let w = wordCount - 1; w >= wordShift; w -= 1) {
        bits[w] = bits[w]! | bits[w - wordShift]!;
      }
    } else {
      for (let w = wordCount - 1; w >= wordShift; w -= 1) {
        const hi = bits[w - wordShift]! << bitShift;
        const lo = w - wordShift - 1 >= 0
          ? bits[w - wordShift - 1]! >>> (32 - bitShift)
          : 0;
        bits[w] = bits[w]! | (hi | lo) >>> 0;
      }
    }
  }
  const targetWord = target >>> 5;
  const targetBit = target & 31;
  return ((bits[targetWord]! >>> targetBit) & 1) === 1;
}
