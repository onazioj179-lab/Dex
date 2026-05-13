// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Iterative integer partitions. Given `n`, returns all partitions of
 * n into positive integer parts (each partition sorted descending).
 * Order of partitions: also descending lexicographic.
 */

export function partitionInteger(n: number): number[][] {
  if (!Number.isInteger(n) || n < 0) throw new Error('partitionInteger: n must be non-negative integer');
  if (n === 0) return [[]];
  const out: number[][] = [];
  const current: number[] = new Array(n).fill(0);
  current[0] = n;
  let depth = 1;
  while (true) {
    out.push(current.slice(0, depth));
    // Find rightmost part > 1 to decrement
    let rem = 0;
    while (depth > 0 && current[depth - 1] === 1) {
      rem += 1;
      depth -= 1;
    }
    if (depth === 0) break;
    current[depth - 1] = current[depth - 1]! - 1;
    rem += 1;
    while (rem > current[depth - 1]!) {
      current[depth] = current[depth - 1]!;
      rem -= current[depth - 1]!;
      depth += 1;
    }
    current[depth] = rem;
    depth += 1;
  }
  return out;
}
