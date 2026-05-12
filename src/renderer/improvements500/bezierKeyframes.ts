// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bezier keyframe utilities (T3-051, T3-052).
 *
 * Cubic Bezier evaluation for keyframe interpolation + a small library of
 * named easing presets (T3-052). Pure math, no React.
 */

export type Vec2 = readonly [number, number];

export interface BezierKeyframe {
  t: number;        // time (seconds or normalized 0..1, caller's choice)
  v: number;        // value
  /** Outgoing tangent control point relative to (t,v). */
  outTangent?: Vec2;
  /** Incoming tangent control point relative to (t,v). */
  inTangent?: Vec2;
}

/** Evaluate a cubic Bezier at parameter `s` in [0,1] from p0..p3. */
export function cubicBezier(s: number, p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Vec2 {
  const u = 1 - s;
  const x = u * u * u * p0[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s * s * s * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s * s * s * p3[1];
  return [x, y];
}

/** Solve cubic-bezier easing y for given x (CSS-style; p0=(0,0), p3=(1,1)). */
export function cubicBezierEasing(x: number, p1: Vec2, p2: Vec2, samples = 20): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Bisection on s such that bezierX(s) ≈ x.
  let lo = 0, hi = 1;
  for (let i = 0; i < samples; i++) {
    const mid = (lo + hi) / 2;
    const [bx] = cubicBezier(mid, [0, 0], p1, p2, [1, 1]);
    if (bx < x) lo = mid; else hi = mid;
  }
  const [, by] = cubicBezier((lo + hi) / 2, [0, 0], p1, p2, [1, 1]);
  return by;
}

/** Named easing presets (T3-052). Each is a cubic-bezier control pair. */
export const EASING_PRESETS = {
  linear:        { p1: [0, 0]   as Vec2, p2: [1, 1]   as Vec2 },
  easeIn:        { p1: [0.42, 0] as Vec2, p2: [1, 1]   as Vec2 },
  easeOut:       { p1: [0, 0]   as Vec2, p2: [0.58, 1] as Vec2 },
  easeInOut:     { p1: [0.42, 0] as Vec2, p2: [0.58, 1] as Vec2 },
  // Spring/elastic approximations using overshoot control points.
  elasticIn:     { p1: [0.7, -0.5] as Vec2, p2: [0.95, 0.05] as Vec2 },
  elasticOut:    { p1: [0.05, 0.95] as Vec2, p2: [0.3, 1.5]   as Vec2 },
  back:          { p1: [0.34, 1.56] as Vec2, p2: [0.64, 1]    as Vec2 },
  bounce:        { p1: [0.68, -0.55] as Vec2, p2: [0.27, 1.55] as Vec2 },
} as const;

export type EasingPresetName = keyof typeof EASING_PRESETS;

/** Apply an easing preset by name. */
export function ease(x: number, name: EasingPresetName): number {
  const { p1, p2 } = EASING_PRESETS[name];
  return cubicBezierEasing(x, p1, p2);
}

/** Interpolate value between two keyframes with bezier tangents. */
export function interpolateKeyframes(a: BezierKeyframe, b: BezierKeyframe, t: number): number {
  if (b.t <= a.t) return a.v;
  if (t <= a.t) return a.v;
  if (t >= b.t) return b.v;
  const span = b.t - a.t;
  const s = (t - a.t) / span;
  // Convert tangents (relative offsets) to absolute control points.
  const p0: Vec2 = [a.t, a.v];
  const p3: Vec2 = [b.t, b.v];
  const out = a.outTangent ?? [span / 3, 0];
  const inn = b.inTangent  ?? [-span / 3, 0];
  const p1: Vec2 = [a.t + out[0], a.v + out[1]];
  const p2: Vec2 = [b.t + inn[0], b.v + inn[1]];
  // Find s such that x ≈ t via bisection.
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const [bx] = cubicBezier(mid, p0, p1, p2, p3);
    if (bx < t) lo = mid; else hi = mid;
  }
  const [, by] = cubicBezier((lo + hi) / 2, p0, p1, p2, p3);
  void s; // s is for future analytical solver
  return by;
}
