// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Square matrix inverse via Gauss-Jordan elimination with partial
 * pivoting. Returns null if matrix is singular (or near-singular).
 */

export function matrixInverse(matrix: ReadonlyArray<ReadonlyArray<number>>): number[][] | null {
  const n = matrix.length;
  if (n === 0) return [];
  for (const row of matrix) {
    if (row.length !== n) throw new Error('matrixInverse: matrix must be square');
  }
  // Build augmented [A | I]
  const aug: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row = new Array<number>(2 * n).fill(0);
    for (let j = 0; j < n; j += 1) row[j] = matrix[i]![j]!;
    row[n + i] = 1;
    aug.push(row);
  }
  for (let col = 0; col < n; col += 1) {
    // Pivot: largest abs value in column at or below col
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(aug[r]![col]!);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-12) return null;
    if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow]!, aug[col]!];
    const pivot = aug[col]![col]!;
    for (let j = 0; j < 2 * n; j += 1) aug[col]![j] = aug[col]![j]! / pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r]![col]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) {
        aug[r]![j] = aug[r]![j]! - factor * aug[col]![j]!;
      }
    }
  }
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) out.push(aug[i]!.slice(n));
  return out;
}
