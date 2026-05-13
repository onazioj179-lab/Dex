// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 1D gradient descent with fixed step size. Returns minimizer x.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface GradientDescentOptions {
  learningRate?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface GradientDescentResult {
  x: number;
  iterations: number;
  converged: boolean;
}

export function gradientDescent1d(
  grad: (x: number) => number,
  x0: number,
  options: GradientDescentOptions = {},
): GradientDescentResult {
  const lr = options.learningRate ?? 0.01;
  const maxIter = options.maxIterations ?? 1000;
  const tol = options.tolerance ?? 1e-9;
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const g = grad(x);
    if (!Number.isFinite(g)) throw new Error('gradientDescent1d: non-finite gradient');
    if (Math.abs(g) < tol) return { x, iterations: i, converged: true };
    x -= lr * g;
  }
  return { x, iterations: maxIter, converged: false };
}
