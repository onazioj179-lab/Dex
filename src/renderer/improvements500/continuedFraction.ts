// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Continued fraction expansion of a real number, plus convergents.
 */

export interface ContinuedFraction {
  /** Continued fraction coefficients [a0; a1, a2, ...]. */
  coeffs: number[];
  /** Rational convergents { num, den } in order. */
  convergents: Array<{ num: number; den: number }>;
}

export function continuedFraction(x: number, maxTerms = 32, eps = 1e-12): ContinuedFraction {
  const coeffs: number[] = [];
  const convergents: Array<{ num: number; den: number }> = [];
  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  let v = x;
  for (let i = 0; i < maxTerms; i += 1) {
    const a = Math.floor(v);
    coeffs.push(a);
    const h = a * h1 + h0;
    const k = a * k1 + k0;
    convergents.push({ num: h, den: k });
    const frac = v - a;
    if (Math.abs(frac) < eps) break;
    v = 1 / frac;
    h0 = h1;
    h1 = h;
    k0 = k1;
    k1 = k;
  }
  return { coeffs, convergents };
}
