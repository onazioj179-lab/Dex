// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Brent's method for 1D function root finding on a bracketed interval.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface BrentOptions {
  tolerance?: number;
  maxIterations?: number;
}

export function brentRoot(
  f: (x: number) => number,
  lower: number,
  upper: number,
  options: BrentOptions = {},
): number {
  const tol = options.tolerance ?? 1e-12;
  const maxIter = options.maxIterations ?? 200;
  let a = lower;
  let b = upper;
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) throw new Error('brentRoot: f(a) and f(b) must bracket a root');
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let mflag = true;
  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.abs(fb) < tol || Math.abs(b - a) < tol) return b;
    let s: number;
    if (fa !== fc && fb !== fc) {
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      s = b - (fb * (b - a)) / (fb - fa);
    }
    const cond1 = (s < (3 * a + b) / 4 || s > b) && (s > (3 * a + b) / 4 || s < b);
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    if (cond1 || cond2 || cond3) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }
    const fs = f(s);
    d = c;
    c = b;
    fc = fb;
    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }
    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }
  }
  return b;
}
