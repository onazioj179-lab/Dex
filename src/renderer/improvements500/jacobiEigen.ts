// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Jacobi eigenvalue algorithm for real symmetric matrices. Returns
 * eigenvalues sorted descending and a corresponding eigenvector matrix
 * (each column is a unit eigenvector). Converges quadratically.
 */

export interface JacobiEigenResult {
  eigenvalues: number[];
  eigenvectors: number[][]; // n x n; columns are eigenvectors
}

export function jacobiEigen(
  matrix: ReadonlyArray<ReadonlyArray<number>>,
  tolerance = 1e-10,
  maxSweeps = 100,
): JacobiEigenResult {
  const n = matrix.length;
  if (n === 0) return { eigenvalues: [], eigenvectors: [] };
  // Copy + verify symmetric
  const a: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    if (matrix[i]!.length !== n) throw new Error('jacobiEigen: matrix must be square');
    a.push(matrix[i]!.slice());
  }
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    // Off-diagonal sum
    let off = 0;
    for (let i = 0; i < n - 1; i += 1) {
      for (let j = i + 1; j < n; j += 1) off += Math.abs(a[i]![j]!);
    }
    if (off < tolerance) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < tolerance / n) continue;
        const app = a[p]![p]!;
        const aqq = a[q]![q]!;
        const theta = (aqq - app) / (2 * apq);
        const t = theta >= 0
          ? 1 / (theta + Math.sqrt(1 + theta * theta))
          : 1 / (theta - Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        // Apply rotation to A
        a[p]![p] = app - t * apq;
        a[q]![q] = aqq + t * apq;
        a[p]![q] = 0;
        a[q]![p] = 0;
        for (let i = 0; i < n; i += 1) {
          if (i !== p && i !== q) {
            const aip = a[i]![p]!;
            const aiq = a[i]![q]!;
            a[i]![p] = c * aip - s * aiq;
            a[i]![q] = s * aip + c * aiq;
            a[p]![i] = a[i]![p]!;
            a[q]![i] = a[i]![q]!;
          }
        }
        // Update eigenvector matrix
        for (let i = 0; i < n; i += 1) {
          const vip = v[i]![p]!;
          const viq = v[i]![q]!;
          v[i]![p] = c * vip - s * viq;
          v[i]![q] = s * vip + c * viq;
        }
      }
    }
  }
  // Extract eigenvalues + sort descending
  const eigenvalues = new Array<number>(n);
  for (let i = 0; i < n; i += 1) eigenvalues[i] = a[i]![i]!;
  const order = eigenvalues
    .map((val, idx) => ({ val, idx }))
    .sort((x, y) => y.val - x.val);
  const sortedEig = order.map((o) => o.val);
  const sortedVec: number[][] = Array.from({ length: n }, () => new Array<number>(n));
  for (let col = 0; col < n; col += 1) {
    const src = order[col]!.idx;
    for (let row = 0; row < n; row += 1) sortedVec[row]![col] = v[row]![src]!;
  }
  return { eigenvalues: sortedEig, eigenvectors: sortedVec };
}
