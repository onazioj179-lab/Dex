// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Core numeric helpers (sliders, timelines, animation, layout). Clamp, linear
 * interpolation, range remapping and rounding — the small math used across the
 * shell and creative apps. Pure: no DOM, no IO.
 */

/** Constrain `v` to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Linear interpolation from a→b by t (t is not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp: where `v` lies in [a, b] as 0..1 (0 when a===b). */
export function inverseLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return (v - a) / (b - a);
}

/** Remap `v` from [inMin,inMax] to [outMin,outMax]. Optionally clamp the output. */
export function mapRange(
  v: number, inMin: number, inMax: number, outMin: number, outMax: number, clampOutput = false,
): number {
  const t = inverseLerp(inMin, inMax, v);
  const out = lerp(outMin, outMax, t);
  return clampOutput ? clamp(out, Math.min(outMin, outMax), Math.max(outMin, outMax)) : out;
}

/** Round `v` to `decimals` decimal places. */
export function roundTo(v: number, decimals = 0): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** Always-positive modulo (n mod m). */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** True when two numbers are within `epsilon`. */
export function approxEqual(a: number, b: number, epsilon = 1e-9): boolean {
  return Math.abs(a - b) <= epsilon;
}
