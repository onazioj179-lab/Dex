// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cubic-bezier easing (Flux keyframe curves CRT-132/143, motion system). Builds
 * a `t -> eased` function from CSS-style control points (p1x,p1y,p2x,p2y), the
 * same form as `cubic-bezier()`. Solves x(t)=x for the parametric t via
 * Newton-Raphson with a bisection fallback, then returns y. Pure: no DOM.
 */

const NEWTON_ITERS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_EPS = 1e-7;
const SUBDIVISION_MAX = 12;

// B(t) for one axis given control points a (p1) and b (p2); endpoints 0 and 1.
function calc(a: number, b: number, t: number): number {
  // 3(1-t)^2 t a + 3(1-t) t^2 b + t^3
  const mt = 1 - t;
  return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t;
}

function slope(a: number, b: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * a + 6 * mt * t * (b - a) + 3 * t * t * (1 - b);
}

function solveT(x: number, p1x: number, p2x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  // Newton-Raphson.
  for (let i = 0; i < NEWTON_ITERS; i++) {
    const xv = calc(p1x, p2x, t) - x;
    const d = slope(p1x, p2x, t);
    if (Math.abs(d) < NEWTON_MIN_SLOPE) break;
    t -= xv / d;
  }
  // Bisection fallback to guarantee convergence into [0,1].
  let lo = 0, hi = 1;
  t = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SUBDIVISION_MAX; i++) {
    const xv = calc(p1x, p2x, t);
    if (Math.abs(xv - x) < SUBDIVISION_EPS) break;
    if (xv < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/**
 * Build an easing function `(x:0..1) -> y:0..1` from cubic-bezier control points.
 * Linear `cubicBezier(0,0,1,1)` is identity.
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): (x: number) => number {
  const px = Math.min(1, Math.max(0, p1x));
  const qx = Math.min(1, Math.max(0, p2x));
  if (px === p1y && qx === p2y) return (x) => x; // linear shortcut
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return calc(p1y, p2y, solveT(x, px, qx));
  };
}

/** One-shot sample of a cubic-bezier easing at progress `x`. */
export function easeAt(x: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  return cubicBezier(p1x, p1y, p2x, p2y)(x);
}
