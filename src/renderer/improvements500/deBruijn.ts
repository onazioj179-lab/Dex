// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * De Bruijn sequence generator B(k, n) - a cyclic sequence over an
 * alphabet of size k in which every length-n sequence over the
 * alphabet appears exactly once as a contiguous substring.
 */

export function deBruijnSequence(k: number, n: number): number[] {
  if (k < 1 || n < 1) throw new Error('deBruijnSequence: k and n must be >= 1');
  const a: number[] = new Array(k * n).fill(0);
  const sequence: number[] = [];

  const db = (t: number, p: number): void => {
    if (t > n) {
      if (n % p === 0) {
        for (let i = 1; i <= p; i += 1) sequence.push(a[i]!);
      }
    } else {
      a[t] = a[t - p]!;
      db(t + 1, p);
      for (let j = a[t - p]! + 1; j < k; j += 1) {
        a[t] = j;
        db(t + 1, t);
      }
    }
  };
  db(1, 1);
  return sequence;
}
