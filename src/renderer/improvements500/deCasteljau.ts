// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cubic Bezier evaluation via De Casteljau's algorithm. Numerically
 * stable subdivision-friendly evaluation.
 */

export interface BezierPoint {
  x: number;
  y: number;
}

export function deCasteljauCubic(
  p0: BezierPoint,
  p1: BezierPoint,
  p2: BezierPoint,
  p3: BezierPoint,
  t: number,
): BezierPoint {
  const u = 1 - t;
  const ax = u * p0.x + t * p1.x;
  const ay = u * p0.y + t * p1.y;
  const bx = u * p1.x + t * p2.x;
  const by = u * p1.y + t * p2.y;
  const cx = u * p2.x + t * p3.x;
  const cy = u * p2.y + t * p3.y;
  const dx = u * ax + t * bx;
  const dy = u * ay + t * by;
  const ex = u * bx + t * cx;
  const ey = u * by + t * cy;
  return { x: u * dx + t * ex, y: u * dy + t * ey };
}

/** Sample a cubic Bezier curve into `samples + 1` points (inclusive). */
export function sampleCubicBezier(
  p0: BezierPoint,
  p1: BezierPoint,
  p2: BezierPoint,
  p3: BezierPoint,
  samples: number,
): BezierPoint[] {
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error('sampleCubicBezier: samples must be a positive integer');
  }
  const out: BezierPoint[] = [];
  for (let i = 0; i <= samples; i += 1) {
    out.push(deCasteljauCubic(p0, p1, p2, p3, i / samples));
  }
  return out;
}
