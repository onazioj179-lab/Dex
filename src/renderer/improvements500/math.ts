// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Numeric helpers shared across renderer code (clamp / lerp / inverseLerp /
 * smoothstep / wrap / modulo). Hot-path safe; no allocations.
 */

import { clamp, lerp } from '../../shared/math/num';
export { clamp, lerp };

export function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-12), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Mathematical modulo (result has the sign of the divisor). */
export function modulo(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Wrap value into [min, max). */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  return min + modulo(value - min, range);
}

export function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}
