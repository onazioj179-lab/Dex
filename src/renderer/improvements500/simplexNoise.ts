// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Simplex (OpenSimplex-style 2D) noise - smoother gradient noise than
 * Perlin and free of grid-aligned artifacts. Deterministic per seed.
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  let s = (seed >>> 0) || 1;
  const rng = (): number => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) p[i] = base[i & 255]!;
  return p;
}

export class SimplexNoise {
  private readonly perm: Uint8Array;

  constructor(seed = 1337) {
    this.perm = buildPerm(seed);
  }

  noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]!]! % 8;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]!]! % 8;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]!]! % 8;
    const dot = (g: number[], x: number, y: number): number => g[0]! * x + g[1]! * y;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    const n0 = t0 < 0 ? 0 : (t0 *= t0) * t0 * dot(grad2[gi0]!, x0, y0);
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    const n1 = t1 < 0 ? 0 : (t1 *= t1) * t1 * dot(grad2[gi1]!, x1, y1);
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    const n2 = t2 < 0 ? 0 : (t2 *= t2) * t2 * dot(grad2[gi2]!, x2, y2);
    return 70 * (n0 + n1 + n2);
  }
}
