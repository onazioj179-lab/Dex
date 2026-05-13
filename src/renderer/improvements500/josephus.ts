// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Josephus problem solver. Given `n` people in a circle counting off
 * by `k`, returns the 0-indexed position of the survivor. O(n).
 */

export function josephus(n: number, k: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('josephus: n must be positive integer');
  if (!Number.isInteger(k) || k < 1) throw new Error('josephus: k must be positive integer');
  let result = 0;
  for (let i = 2; i <= n; i += 1) {
    result = (result + k) % i;
  }
  return result;
}
