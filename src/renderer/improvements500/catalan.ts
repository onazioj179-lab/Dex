// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Catalan numbers C_n. C_0..C_n via recurrence
 * C_{n+1} = sum_{i=0..n} C_i * C_{n-i}.
 */

export function catalan(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error('catalan: n must be non-negative integer');
  const c = new Array<number>(n + 1).fill(0);
  c[0] = 1;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 0; j < i; j += 1) c[i] = c[i]! + c[j]! * c[i - 1 - j]!;
  }
  return c[n]!;
}

/** First n+1 Catalan numbers as an array. */
export function catalanList(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new Error('catalanList: n must be non-negative integer');
  const c = new Array<number>(n + 1).fill(0);
  c[0] = 1;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 0; j < i; j += 1) c[i] = c[i]! + c[j]! * c[i - 1 - j]!;
  }
  return c;
}
