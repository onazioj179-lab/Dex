// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bernstein polynomial basis B_{i,n}(t).
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  const j = Math.min(k, n - k);
  for (let i = 0; i < j; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

export function bernsteinBasis(i: number, n: number, t: number): number {
  if (i < 0 || i > n) return 0;
  return binomial(n, i) * t ** i * (1 - t) ** (n - i);
}

export function bernsteinEval(coeffs: readonly number[], t: number): number {
  const n = coeffs.length - 1;
  let sum = 0;
  for (let i = 0; i <= n; i++) sum += coeffs[i]! * bernsteinBasis(i, n, t);
  return sum;
}
