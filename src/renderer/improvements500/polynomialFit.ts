// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polynomial least-squares regression via the normal equations.
 * For small degrees (typically <= 8) this is fine; for higher degrees
 * use an orthogonal-polynomial approach to avoid ill-conditioning.
 */

function gaussianSolve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  // Build augmented matrix
  const a: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    a.push([...matrix[i]!, rhs[i]!]);
  }
  for (let i = 0; i < n; i += 1) {
    // Partial pivot
    let maxRow = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(a[r]![i]!) > Math.abs(a[maxRow]![i]!)) maxRow = r;
    }
    [a[i], a[maxRow]] = [a[maxRow]!, a[i]!];
    const pivot = a[i]![i]!;
    if (Math.abs(pivot) < 1e-15) throw new Error('matrix is singular');
    for (let r = i + 1; r < n; r += 1) {
      const factor = a[r]![i]! / pivot;
      for (let c = i; c <= n; c += 1) {
        a[r]![c] = a[r]![c]! - factor * a[i]![c]!;
      }
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = a[i]![n]!;
    for (let j = i + 1; j < n; j += 1) sum -= a[i]![j]! * x[j]!;
    x[i] = sum / a[i]![i]!;
  }
  return x;
}

/**
 * Fit a polynomial of given degree to (xs, ys). Returns coefficients
 * [a0, a1, ..., aDegree] for f(x) = a0 + a1*x + a2*x^2 + ...
 */
export function polynomialFit(
  xs: readonly number[],
  ys: readonly number[],
  degree: number,
): number[] {
  if (xs.length !== ys.length) throw new Error('xs and ys must have same length');
  if (degree < 0) throw new Error('degree must be non-negative');
  if (xs.length < degree + 1) throw new Error('not enough points for requested degree');
  const m = degree + 1;
  // Powers of x precomputed up to 2*degree
  const sumsX = new Array<number>(2 * degree + 1).fill(0);
  for (const x of xs) {
    let p = 1;
    for (let k = 0; k <= 2 * degree; k += 1) {
      sumsX[k] = sumsX[k]! + p;
      p *= x;
    }
  }
  const sumsXY = new Array<number>(m).fill(0);
  for (let i = 0; i < xs.length; i += 1) {
    let p = 1;
    for (let k = 0; k < m; k += 1) {
      sumsXY[k] = sumsXY[k]! + p * ys[i]!;
      p *= xs[i]!;
    }
  }
  const matrix: number[][] = [];
  for (let i = 0; i < m; i += 1) {
    const row = new Array<number>(m).fill(0);
    for (let j = 0; j < m; j += 1) row[j] = sumsX[i + j]!;
    matrix.push(row);
  }
  return gaussianSolve(matrix, sumsXY);
}

/** Evaluate polynomial coeffs (low-order first) at x using Horner's rule. */
export function polynomialEval(coeffs: readonly number[], x: number): number {
  let acc = 0;
  for (let i = coeffs.length - 1; i >= 0; i -= 1) acc = acc * x + coeffs[i]!;
  return acc;
}
