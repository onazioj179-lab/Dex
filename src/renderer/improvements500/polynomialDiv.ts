// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polynomial long division. Coefficients are little-endian (index 0
 * is constant term). Returns quotient and remainder arrays.
 */

export interface PolyDivResult {
  quotient: number[];
  remainder: number[];
}

export function polynomialDiv(
  numerator: ReadonlyArray<number>,
  denominator: ReadonlyArray<number>,
): PolyDivResult {
  if (denominator.length === 0) throw new Error('polynomialDiv: zero divisor');
  // Trim leading-(highest)-zero coefficients
  let dEnd = denominator.length - 1;
  while (dEnd > 0 && denominator[dEnd] === 0) dEnd -= 1;
  if (dEnd === 0 && denominator[0] === 0) throw new Error('polynomialDiv: zero divisor');
  const remainder = numerator.slice();
  const dDeg = dEnd;
  const dLead = denominator[dEnd]!;
  let nDeg = remainder.length - 1;
  while (nDeg >= 0 && remainder[nDeg] === 0) nDeg -= 1;
  if (nDeg < dDeg) return { quotient: [0], remainder: remainder.slice(0, Math.max(1, nDeg + 1)) };
  const quotient = new Array(nDeg - dDeg + 1).fill(0);
  for (let i = nDeg; i >= dDeg; i -= 1) {
    const coef = remainder[i]! / dLead;
    quotient[i - dDeg] = coef;
    for (let j = 0; j <= dDeg; j += 1) {
      remainder[i - dDeg + j] = remainder[i - dDeg + j]! - coef * denominator[j]!;
    }
  }
  // Trim remainder
  let remEnd = dDeg - 1;
  while (remEnd > 0 && Math.abs(remainder[remEnd]!) < 1e-12) remEnd -= 1;
  return { quotient, remainder: remainder.slice(0, remEnd + 1) };
}
