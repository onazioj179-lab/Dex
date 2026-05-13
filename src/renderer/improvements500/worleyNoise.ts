// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D Worley (cellular) noise. Returns the distance to the nearest feature
 * point for each cell of a uniform grid. Period and seed control the
 * pseudo-random feature points (one per integer cell).
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
function hash32(x: number, y: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x9e3779b1);
  h = Math.imul(h ^ (y | 0), 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae3d);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

export function worleyNoise2d(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let best = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const fx = cx + hash32(cx, cy, seed);
      const fy = cy + hash32(cx, cy, seed ^ 0x12345678);
      const dx = fx - x;
      const dy = fy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}
