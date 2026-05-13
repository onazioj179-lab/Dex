/*
 * DEX - Morton (Z-order) 2D <-> 1D mapping (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

function part1By1(n: number): number {
  let x = n & 0x0000ffff;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  return x >>> 0;
}

function compact1By1(n: number): number {
  let x = n & 0x55555555;
  x = (x ^ (x >> 1)) & 0x33333333;
  x = (x ^ (x >> 2)) & 0x0f0f0f0f;
  x = (x ^ (x >> 4)) & 0x00ff00ff;
  x = (x ^ (x >> 8)) & 0x0000ffff;
  return x >>> 0;
}

/** Interleave bits of x and y to produce a 32-bit Morton code (x,y < 2^16). */
export function mortonEncode(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= 0x10000 || y >= 0x10000) {
    throw new RangeError('mortonEncode requires 0 <= x,y < 65536');
  }
  return (part1By1(x) | (part1By1(y) << 1)) >>> 0;
}

/** Inverse of mortonEncode. */
export function mortonDecode(code: number): [number, number] {
  return [compact1By1(code), compact1By1(code >>> 1)];
}
