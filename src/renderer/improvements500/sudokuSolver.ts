// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 9x9 Sudoku solver via backtracking with bitmask constraints.
 */

/**
 * Solve a Sudoku grid in-place. `grid` is a Uint8Array of length 81
 * with 0 representing empty cells. Returns true when a solution exists
 * (and `grid` will be filled), false otherwise.
 */
export function sudokuSolver(grid: Uint8Array): boolean {
  if (grid.length !== 81) throw new Error('sudokuSolver: grid must have length 81');
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const v = grid[r * 9 + c]!;
      if (v === 0) continue;
      if (v < 1 || v > 9) return false;
      const bit = 1 << (v - 1);
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      if (rows[r]! & bit || cols[c]! & bit || boxes[b]! & bit) return false;
      rows[r] = rows[r]! | bit;
      cols[c] = cols[c]! | bit;
      boxes[b] = boxes[b]! | bit;
    }
  }
  const empties: number[] = [];
  for (let i = 0; i < 81; i += 1) if (grid[i] === 0) empties.push(i);

  const recurse = (idx: number): boolean => {
    if (idx === empties.length) return true;
    const pos = empties[idx]!;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const used = rows[r]! | cols[c]! | boxes[b]!;
    let avail = ~used & 0x1ff;
    while (avail !== 0) {
      const bit = avail & -avail;
      avail ^= bit;
      let val = 1;
      let bb = bit;
      while (bb > 1) {
        bb >>= 1;
        val += 1;
      }
      grid[pos] = val;
      rows[r] = rows[r]! | bit;
      cols[c] = cols[c]! | bit;
      boxes[b] = boxes[b]! | bit;
      if (recurse(idx + 1)) return true;
      grid[pos] = 0;
      rows[r] = rows[r]! & ~bit;
      cols[c] = cols[c]! & ~bit;
      boxes[b] = boxes[b]! & ~bit;
    }
    return false;
  };
  return recurse(0);
}
