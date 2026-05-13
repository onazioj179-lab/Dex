// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * N-Queens solver. Returns the count of solutions and optionally one
 * board layout (column index per row). Uses iterative bitmask backtracking.
 */

export interface NQueensResult {
  count: number;
  first: number[] | null;
}

export function nQueens(n: number): NQueensResult {
  if (n <= 0) return { count: 0, first: null };
  if (n === 1) return { count: 1, first: [0] };
  if (n === 2 || n === 3) return { count: 0, first: null };
  let count = 0;
  let first: number[] | null = null;
  const placement = new Int32Array(n);
  const all = (1 << n) - 1;

  const recurse = (row: number, cols: number, ld: number, rd: number): void => {
    if (cols === all) {
      count += 1;
      if (!first) first = Array.from(placement);
      return;
    }
    let avail = all & ~(cols | ld | rd);
    while (avail !== 0) {
      const bit = avail & -avail;
      avail ^= bit;
      let col = 0;
      let b = bit;
      while (b > 1) {
        b >>= 1;
        col += 1;
      }
      placement[row] = col;
      recurse(row + 1, cols | bit, (ld | bit) << 1, (rd | bit) >>> 1);
    }
  };
  recurse(0, 0, 0, 0);
  return { count, first };
}
