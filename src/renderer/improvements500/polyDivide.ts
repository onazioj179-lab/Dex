// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Long division of polynomials. Inputs are coefficient arrays with index
 * i corresponding to x^i. Returns { quotient, remainder }.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface PolyDivideResult {
  quotient: number[];
  remainder: number[];
}

export function polyDivide(
  numerator: readonly number[],
  denominator: readonly number[],
): PolyDivideResult {
  if (denominator.length === 0) throw new Error('polyDivide: denominator is empty');
  const denomDeg = denominator.length - 1;
  if (Math.abs(denominator[denomDeg]!) < 1e-15) throw new Error('polyDivide: leading denominator coefficient is zero');

  const r = numerator.slice();
  const numDeg = r.length - 1;
  if (numDeg < denomDeg) return { quotient: [0], remainder: r };

  const q = new Array<number>(numDeg - denomDeg + 1).fill(0);
  for (let i = numDeg - denomDeg; i >= 0; i--) {
    const coef = r[i + denomDeg]! / denominator[denomDeg]!;
    q[i] = coef;
    for (let j = 0; j <= denomDeg; j++) r[i + j] = r[i + j]! - coef * denominator[j]!;
  }
  // Trim remainder.
  let last = denomDeg - 1;
  while (last > 0 && Math.abs(r[last]!) < 1e-12) last--;
  const remainder = r.slice(0, Math.max(1, last + 1));
  return { quotient: q, remainder };
}
