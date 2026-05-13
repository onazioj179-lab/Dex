// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Natural cubic spline interpolation. Builds tridiagonal system using
 * the Thomas algorithm.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface CubicSpline {
  xs: Float64Array;
  ys: Float64Array;
  m: Float64Array;
}

export function buildNaturalCubicSpline(xs: readonly number[], ys: readonly number[]): CubicSpline {
  const n = xs.length;
  if (n !== ys.length) throw new RangeError('cubicSpline: xs and ys must match');
  if (n < 2) throw new RangeError('cubicSpline: need at least 2 points');
  for (let i = 1; i < n; i++) {
    if (!(xs[i]! > xs[i - 1]!)) throw new RangeError('cubicSpline: xs must be strictly increasing');
  }

  const h = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1]! - xs[i]!;

  const a = new Float64Array(n);
  const b = new Float64Array(n);
  const c = new Float64Array(n);
  const d = new Float64Array(n);
  b[0] = 1;
  b[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) {
    a[i] = h[i - 1]!;
    b[i] = 2 * (h[i - 1]! + h[i]!);
    c[i] = h[i]!;
    d[i] = 6 * ((ys[i + 1]! - ys[i]!) / h[i]! - (ys[i]! - ys[i - 1]!) / h[i - 1]!);
  }

  for (let i = 1; i < n; i++) {
    const w = a[i]! / b[i - 1]!;
    b[i] = b[i]! - w * c[i - 1]!;
    d[i] = d[i]! - w * d[i - 1]!;
  }
  const m = new Float64Array(n);
  m[n - 1] = d[n - 1]! / b[n - 1]!;
  for (let i = n - 2; i >= 0; i--) m[i] = (d[i]! - c[i]! * m[i + 1]!) / b[i]!;

  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys), m };
}

export function evalCubicSpline(spline: CubicSpline, x: number): number {
  const { xs, ys, m } = spline;
  const n = xs.length;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! > x) hi = mid;
    else lo = mid;
  }
  const h = xs[hi]! - xs[lo]!;
  const a = (xs[hi]! - x) / h;
  const b = (x - xs[lo]!) / h;
  return (
    a * ys[lo]! +
    b * ys[hi]! +
    (((a * a * a - a) * m[lo]! + (b * b * b - b) * m[hi]!) * h * h) / 6
  );
}
