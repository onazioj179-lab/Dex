// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Named easing presets (motion system, Flux keyframes, UI transitions). Maps
 * familiar easing names to their cubic-bezier control points and builds the
 * easing function via `bezier.cubicBezier`. Pure: no DOM.
 */

import { cubicBezier } from './bezier';

/** Control points [p1x, p1y, p2x, p2y] per CSS easing semantics. */
export const EASING_POINTS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  // DEX house curves.
  tahoe: [0.23, 1, 0.32, 1],
  spring: [0.175, 0.885, 0.32, 1.275],
  sharp: [0.4, 0, 0.6, 1],
};

export type EasingName = keyof typeof EASING_POINTS;

/** Names of the available easings. */
export function easingNames(): string[] {
  return Object.keys(EASING_POINTS);
}

/** Build an easing function for a named preset (falls back to linear). */
export function namedEasing(name: string): (x: number) => number {
  const pts = EASING_POINTS[name] ?? EASING_POINTS.linear;
  return cubicBezier(pts[0], pts[1], pts[2], pts[3]);
}

/** Sample a named easing at progress `x` (0..1). */
export function easeNamed(name: string, x: number): number {
  return namedEasing(name)(x);
}

/** CSS `cubic-bezier(...)` string for a named easing. */
export function easingCss(name: string): string {
  const p = EASING_POINTS[name] ?? EASING_POINTS.linear;
  return `cubic-bezier(${p[0]}, ${p[1]}, ${p[2]}, ${p[3]})`;
}
