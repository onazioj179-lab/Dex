// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Conjugate gradient solver for symmetric positive-definite linear systems.
 * Solves A x = b. A is given as a function (matVec) so sparse matrices work.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ConjugateGradientOptions {
  maxIterations?: number;
  tolerance?: number;
}

export interface ConjugateGradientResult {
  x: Float64Array;
  iterations: number;
  converged: boolean;
  residualNorm: number;
}

export function conjugateGradient(
  matVec: (v: Float64Array) => Float64Array,
  b: Float64Array,
  options: ConjugateGradientOptions = {},
): ConjugateGradientResult {
  const n = b.length;
  const maxIter = options.maxIterations ?? n * 10;
  const tol = options.tolerance ?? 1e-10;
  const x = new Float64Array(n);
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = b[i]!;
  const p = new Float64Array(r);
  let rsOld = 0;
  for (let i = 0; i < n; i++) rsOld += r[i]! * r[i]!;
  if (Math.sqrt(rsOld) < tol) return { x, iterations: 0, converged: true, residualNorm: Math.sqrt(rsOld) };

  for (let it = 0; it < maxIter; it++) {
    const Ap = matVec(p);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i]! * Ap[i]!;
    if (pAp === 0) return { x, iterations: it, converged: false, residualNorm: Math.sqrt(rsOld) };
    const alpha = rsOld / pAp;
    let rsNew = 0;
    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * Ap[i]!;
      rsNew += r[i]! * r[i]!;
    }
    if (Math.sqrt(rsNew) < tol) {
      return { x, iterations: it + 1, converged: true, residualNorm: Math.sqrt(rsNew) };
    }
    const beta = rsNew / rsOld;
    for (let i = 0; i < n; i++) p[i] = r[i]! + beta * p[i]!;
    rsOld = rsNew;
  }
  return { x, iterations: maxIter, converged: false, residualNorm: Math.sqrt(rsOld) };
}
