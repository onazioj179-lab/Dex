// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * B-spline curve evaluation using De Boor's algorithm. Supports
 * uniform and clamped knot vectors with arbitrary degree.
 */

export interface BSplinePt {
  x: number;
  y: number;
}
type Pt2 = BSplinePt;

/** Generate a clamped uniform knot vector for given control-point count and degree. */
export function clampedKnotVector(n: number, degree: number): number[] {
  const m = n + degree + 1;
  const knots: number[] = [];
  for (let i = 0; i < m; i += 1) {
    if (i <= degree) knots.push(0);
    else if (i >= m - degree - 1) knots.push(1);
    else knots.push((i - degree) / (n - degree));
  }
  return knots;
}

function findSpan(n: number, degree: number, u: number, knots: readonly number[]): number {
  if (u >= knots[n]!) return n - 1;
  if (u <= knots[degree]!) return degree;
  let low = degree;
  let high = n;
  let mid = (low + high) >> 1;
  while (u < knots[mid]! || u >= knots[mid + 1]!) {
    if (u < knots[mid]!) high = mid;
    else low = mid;
    mid = (low + high) >> 1;
  }
  return mid;
}

/** Evaluate a B-spline curve at parameter `u` in [0,1]. */
export function bsplinePoint(
  controls: ReadonlyArray<Pt2>,
  degree: number,
  knots: readonly number[],
  u: number,
): Pt2 {
  const n = controls.length;
  if (knots.length !== n + degree + 1) {
    throw new Error('knot vector length must equal controls + degree + 1');
  }
  const span = findSpan(n, degree, u, knots);
  // De Boor recursion
  const d: Pt2[] = [];
  for (let i = 0; i <= degree; i += 1) {
    const cp = controls[span - degree + i]!;
    d.push({ x: cp.x, y: cp.y });
  }
  for (let r = 1; r <= degree; r += 1) {
    for (let j = degree; j >= r; j -= 1) {
      const idx = j + span - degree;
      const denom = knots[idx + degree - r + 1]! - knots[idx]!;
      const alpha = denom === 0 ? 0 : (u - knots[idx]!) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1]!.x + alpha * d[j]!.x,
        y: (1 - alpha) * d[j - 1]!.y + alpha * d[j]!.y,
      };
    }
  }
  return d[degree]!;
}

/** Sample the entire curve uniformly with `samples` total points. */
export function bsplineCurve(
  controls: ReadonlyArray<Pt2>,
  degree: number,
  samples = 64,
): Pt2[] {
  const knots = clampedKnotVector(controls.length, degree);
  const out: Pt2[] = [];
  for (let i = 0; i < samples; i += 1) {
    const u = i / (samples - 1);
    out.push(bsplinePoint(controls, degree, knots, u));
  }
  return out;
}
