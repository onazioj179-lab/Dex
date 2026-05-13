// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Polynomial GCD over the rationals. Coefficients are in ascending order:
 * coeffs[i] is the coefficient of x^i. Returns a monic polynomial.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
function trim(p: number[], eps = 1e-12): number[] {
  let i = p.length - 1;
  while (i > 0 && Math.abs(p[i]!) < eps) i--;
  return p.slice(0, i + 1);
}

function deg(p: number[]): number {
  return p.length - 1;
}

function polyRem(a: number[], b: number[]): number[] {
  let r = a.slice();
  const dB = deg(b);
  const lcB = b[dB]!;
  while (deg(r) >= dB && r.length > 0) {
    const dR = deg(r);
    const coef = r[dR]! / lcB;
    const shift = dR - dB;
    for (let i = 0; i <= dB; i++) r[i + shift] = r[i + shift]! - coef * b[i]!;
    r = trim(r);
    if (deg(r) >= dR) break;
  }
  return trim(r);
}

export function polyGcd(a: readonly number[], b: readonly number[]): number[] {
  let p = trim(a.slice());
  let q = trim(b.slice());
  while (q.length > 1 || (q.length === 1 && Math.abs(q[0]!) > 1e-12)) {
    const r = polyRem(p, q);
    p = q;
    q = r;
  }
  // Make monic.
  const lc = p[deg(p)]!;
  if (lc !== 0) for (let i = 0; i < p.length; i++) p[i] = p[i]! / lc;
  return p;
}
