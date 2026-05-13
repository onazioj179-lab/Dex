// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Catmull-Rom spline interpolation through control points. Produces a
 * smooth curve passing through every input point.
 */

export interface CatmullPt {
  x: number;
  y: number;
}
type Pt = CatmullPt;

/**
 * Evaluate a Catmull-Rom spline segment between p1 and p2 at parameter t [0,1].
 * p0/p3 are the surrounding control points; tension defaults to 0.5 (uniform).
 */
export function catmullRomPoint(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  t: number,
  tension = 0.5,
): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const c = tension;
  const x =
    2 * p1.x +
    (-p0.x + p2.x) * t * c * 2 +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 * c * 2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3 * c * 2;
  const y =
    2 * p1.y +
    (-p0.y + p2.y) * t * c * 2 +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 * c * 2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3 * c * 2;
  return { x: x * 0.5, y: y * 0.5 };
}

/**
 * Sample the entire curve through `points` with `samplesPerSegment`
 * intermediate points per spline segment. Returns the full polyline.
 */
export function catmullRomSpline(
  points: ReadonlyArray<Pt>,
  samplesPerSegment = 16,
  tension = 0.5,
): Pt[] {
  if (points.length < 2) return points.slice();
  const out: Pt[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;
    for (let s = 0; s < samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      out.push(catmullRomPoint(p0, p1, p2, p3, t, tension));
    }
  }
  out.push(points[n - 1]!);
  return out;
}
