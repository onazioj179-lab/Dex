// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Reflected binary Gray code utilities. Conversion between binary
 * and Gray code, plus generation of n-bit Gray sequence.
 */

export function binaryToGray(n: number): number {
  return (n ^ (n >>> 1)) >>> 0;
}

export function grayToBinary(g: number): number {
  let n = g >>> 0;
  let mask = n >>> 1;
  while (mask !== 0) {
    n = (n ^ mask) >>> 0;
    mask >>>= 1;
  }
  return n;
}

/** All 2^bits Gray-code values in sequence. */
export function grayCodeSequence(bits: number): number[] {
  if (!Number.isInteger(bits) || bits < 0 || bits > 30) {
    throw new RangeError('grayCodeSequence: bits must be in [0, 30]');
  }
  const total = 1 << bits;
  const out = new Array<number>(total);
  for (let i = 0; i < total; i += 1) out[i] = binaryToGray(i);
  return out;
}
