// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface NewtonOptions {
  maxIterations?: number;
  tolerance?: number;
}

export function newtonRaphson(
  f: (x: number) => number,
  df: (x: number) => number,
  x0: number,
  opts: NewtonOptions = {},
): number | null {
  const maxIter = opts.maxIterations ?? 100;
  const tol = opts.tolerance ?? 1e-12;
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const y = f(x);
    if (Math.abs(y) < tol) return x;
    const dy = df(x);
    if (dy === 0) return null;
    const next = x - y / dy;
    if (Math.abs(next - x) < tol) return next;
    x = next;
  }
  return null;
}

export function bisection(
  f: (x: number) => number,
  a: number,
  b: number,
  opts: NewtonOptions = {},
): number | null {
  const maxIter = opts.maxIterations ?? 200;
  const tol = opts.tolerance ?? 1e-12;
  let fa = f(a);
  let fb = f(b);
  if (fa * fb > 0) return null;
  for (let i = 0; i < maxIter; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < tol || (b - a) / 2 < tol) return m;
    if (fa * fm < 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
