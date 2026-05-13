// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Durand-Kerner method for finding all roots (real and complex) of a
 * polynomial with real coefficients. Coefficients are highest-order first:
 * coeffs[0]*x^n + coeffs[1]*x^(n-1) + ... + coeffs[n].
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ComplexRoot {
  re: number;
  im: number;
}

function evalPoly(coeffs: readonly number[], z: ComplexRoot): ComplexRoot {
  let re = 0;
  let im = 0;
  for (const c of coeffs) {
    const nre = re * z.re - im * z.im + c;
    const nim = re * z.im + im * z.re;
    re = nre;
    im = nim;
  }
  return { re, im };
}

function complexDiv(a: ComplexRoot, b: ComplexRoot): ComplexRoot {
  const den = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
}

export function durandKernerRoots(
  coeffs: readonly number[],
  maxIterations = 200,
  tolerance = 1e-12,
): ComplexRoot[] {
  if (coeffs.length < 2) throw new RangeError('durandKernerRoots: polynomial must have degree >= 1');
  if (coeffs[0] === 0) throw new RangeError('durandKernerRoots: leading coefficient must be non-zero');
  const monic = coeffs.map((c) => c / coeffs[0]!);
  const n = monic.length - 1;

  const roots: ComplexRoot[] = [];
  // Aberth-style spread initial guesses on a circle
  const r0 = 0.4;
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + Math.PI / (2 * n);
    roots.push({ re: r0 * Math.cos(angle), im: r0 * Math.sin(angle) });
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      let denom: ComplexRoot = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dre = roots[i]!.re - roots[j]!.re;
        const dim = roots[i]!.im - roots[j]!.im;
        const nre = denom.re * dre - denom.im * dim;
        const nim = denom.re * dim + denom.im * dre;
        denom = { re: nre, im: nim };
      }
      const fz = evalPoly(monic, roots[i]!);
      const delta = complexDiv(fz, denom);
      roots[i] = { re: roots[i]!.re - delta.re, im: roots[i]!.im - delta.im };
      const mag = Math.hypot(delta.re, delta.im);
      if (mag > maxDelta) maxDelta = mag;
    }
    if (maxDelta < tolerance) break;
  }
  return roots;
}
