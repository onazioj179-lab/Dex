// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Q15 fixed-point arithmetic helpers. Q15 stores fractional values
 * in [-1, 1) using a signed 16-bit integer scaled by 2^15.
 */

const SCALE = 1 << 15; // 32768

export function toQ15(x: number): number {
  if (x >= 1) return SCALE - 1;
  if (x < -1) return -SCALE;
  return Math.round(x * SCALE) | 0;
}

export function fromQ15(q: number): number {
  return q / SCALE;
}

/** Saturating add of two Q15 values. */
export function q15Add(a: number, b: number): number {
  let s = (a | 0) + (b | 0);
  if (s > SCALE - 1) s = SCALE - 1;
  if (s < -SCALE) s = -SCALE;
  return s;
}

/** Q15 multiply: result also in Q15. */
export function q15Mul(a: number, b: number): number {
  // Math.imul preserves 32-bit signed; shift down 15 to keep Q15
  const product = Math.imul(a | 0, b | 0);
  let r = product >> 15;
  if (r > SCALE - 1) r = SCALE - 1;
  if (r < -SCALE) r = -SCALE;
  return r;
}
