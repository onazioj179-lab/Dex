// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Angle math (rotation handles, dials/knobs, compass headings, hue wheels).
 * Degree/radian conversion, normalization, and shortest-path interpolation that
 * wraps correctly around 360°. Pure: no DOM, no IO.
 */

export function toRadians(degrees: number): number { return (degrees * Math.PI) / 180; }
export function toDegrees(radians: number): number { return (radians * 180) / Math.PI; }

/** Normalize degrees into [0, 360). */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Normalize radians into [0, 2π). */
export function normalizeRadians(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad % twoPi) + twoPi) % twoPi;
}

/** Signed shortest angular delta from `a` to `b` in degrees (−180, 180]. */
export function shortestDelta(a: number, b: number): number {
  let d = normalizeDegrees(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Interpolate between two angles (degrees) along the shortest path. */
export function lerpAngle(a: number, b: number, t: number): number {
  return normalizeDegrees(a + shortestDelta(a, b) * t);
}

/** Snap an angle (degrees) to the nearest multiple of `step`. */
export function snapAngle(deg: number, step: number): number {
  if (step <= 0) return deg;
  return normalizeDegrees(Math.round(deg / step) * step);
}
