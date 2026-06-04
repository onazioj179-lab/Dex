// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D cubic-bezier path sampling (Flux motion paths, Prism/Canvas pen tool). Given
 * four control points, evaluates a point on the curve and samples it into a
 * polyline of N points (e.g. for rendering or hit-testing). Pure: no DOM.
 */

export interface Point { x: number; y: number }

/** Point on a 2D cubic Bézier at parameter t (0..1). */
export function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Sample the curve into `steps`+1 points (inclusive of both ends). */
export function sampleCurve(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const n = Math.max(1, Math.floor(steps));
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(cubicBezierPoint(p0, p1, p2, p3, i / n));
  return out;
}

/** Approximate arc length by summing sampled segment lengths. */
export function curveLength(p0: Point, p1: Point, p2: Point, p3: Point, steps = 32): number {
  const pts = sampleCurve(p0, p1, p2, p3, steps);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}
