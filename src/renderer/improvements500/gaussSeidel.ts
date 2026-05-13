// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Gauss-Seidel iterative solver for diagonally dominant linear systems.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface GaussSeidelOptions {
  maxIterations?: number;
  tolerance?: number;
}

export interface GaussSeidelResult {
  x: Float64Array;
  iterations: number;
  converged: boolean;
}

export function gaussSeidel(
  A: readonly (readonly number[])[],
  b: readonly number[],
  options: GaussSeidelOptions = {},
): GaussSeidelResult {
  const n = b.length;
  if (A.length !== n) throw new RangeError('gaussSeidel: A rows must match b length');
  const maxIter = options.maxIterations ?? 1000;
  const tol = options.tolerance ?? 1e-10;
  const x = new Float64Array(n);
  for (let it = 0; it < maxIter; it++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const row = A[i]!;
      if (row.length !== n) throw new RangeError('gaussSeidel: matrix must be square');
      const aii = row[i]!;
      if (aii === 0) throw new Error('gaussSeidel: zero on diagonal');
      let s = b[i]!;
      for (let j = 0; j < n; j++) if (j !== i) s -= row[j]! * x[j]!;
      const xi = s / aii;
      const d = Math.abs(xi - x[i]!);
      if (d > maxDelta) maxDelta = d;
      x[i] = xi;
    }
    if (maxDelta < tol) return { x, iterations: it + 1, converged: true };
  }
  return { x, iterations: maxIter, converged: false };
}
