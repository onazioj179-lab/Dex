// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 32-bit bit manipulation primitives. All inputs are coerced to
 * unsigned 32-bit integers via `>>> 0` before computation.
 */

/** Population count (number of set bits) of a 32-bit integer. */
export function popcount32(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24) & 0x3f;
}

/** Number of leading zero bits (32 if x = 0). */
export function leadingZeros32(x: number): number {
  const v = x >>> 0;
  if (v === 0) return 32;
  return Math.clz32(v);
}

/** Number of trailing zero bits (32 if x = 0). */
export function trailingZeros32(x: number): number {
  const v = x >>> 0;
  if (v === 0) return 32;
  return 31 - Math.clz32(v & -v);
}

/** Reverse the bits of a 32-bit integer. */
export function reverseBits32(x: number): number {
  let v = x >>> 0;
  v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
  v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
  v = ((v >>> 4) & 0x0f0f0f0f) | ((v & 0x0f0f0f0f) << 4);
  v = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8);
  v = (v >>> 16) | (v << 16);
  return v >>> 0;
}
