// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Solve a linear system Ax = b via Gauss-Jordan elimination with
 * partial pivoting. Returns null if A is singular.
 */

export function gaussJordanSolve(
  A: ReadonlyArray<ReadonlyArray<number>>,
  b: ReadonlyArray<number>,
): number[] | null {
  const n = A.length;
  if (n === 0) return [];
  if (b.length !== n) throw new Error('gaussJordanSolve: dimension mismatch');
  const aug: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    if (A[i]!.length !== n) throw new Error('gaussJordanSolve: A must be square');
    const row = new Array<number>(n + 1);
    for (let j = 0; j < n; j += 1) row[j] = A[i]![j]!;
    row[n] = b[i]!;
    aug.push(row);
  }
  for (let col = 0; col < n; col += 1) {
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
    for (let j = col; j <= n; j += 1) aug[col]![j] = aug[col]![j]! / pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r]![col]!;
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) {
        aug[r]![j] = aug[r]![j]! - factor * aug[col]![j]!;
      }
    }
  }
  const out = new Array<number>(n);
  for (let i = 0; i < n; i += 1) out[i] = aug[i]![n]!;
  return out;
}
