/*
 * DEX - Hilbert space-filling curve mapping (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

/**
 * Convert (x, y) in the unit square of side `n` (n must be a power of two)
 * to a 1D Hilbert index in [0, n*n - 1]. Algorithm from Wikipedia's
 * iterative pseudocode (rotates quadrants per level).
 */
export function hilbertXYToIndex(n: number, x: number, y: number): number {
  if ((n & (n - 1)) !== 0 || n <= 0) throw new Error('n must be positive power of two');
  let rx = 0;
  let ry = 0;
  let d = 0;
  let xi = x;
  let yi = y;
  for (let s = n >> 1; s > 0; s >>= 1) {
    rx = (xi & s) > 0 ? 1 : 0;
    ry = (yi & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        xi = s - 1 - xi;
        yi = s - 1 - yi;
      }
      const t = xi;
      xi = yi;
      yi = t;
    }
  }
  return d;
}

/** Inverse mapping from Hilbert index to (x, y) on a side-`n` grid. */
export function hilbertIndexToXY(n: number, d: number): [number, number] {
  if ((n & (n - 1)) !== 0 || n <= 0) throw new Error('n must be positive power of two');
  let rx = 0;
  let ry = 0;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s <<= 1) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}
