// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Classic Perlin noise (improved 2002 version, 2D and 3D) with a
 * deterministic permutation table seeded by a 32-bit integer.
 */

function shufflePerm(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  // Mulberry32 for deterministic shuffle
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

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

import { lerp } from '../../shared/math/num';

function grad2(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export class PerlinNoise {
  private readonly p: Uint8Array;

  constructor(seed = 1337) {
    this.p = shufflePerm(seed);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = this.p[this.p[X]! + Y]!;
    const ab = this.p[this.p[X]! + Y + 1]!;
    const ba = this.p[this.p[X + 1]! + Y]!;
    const bb = this.p[this.p[X + 1]! + Y + 1]!;
    return lerp(
      lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u),
      lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u),
      v,
    );
  }

  noise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const A = this.p[X]! + Y;
    const AA = this.p[A]! + Z;
    const AB = this.p[A + 1]! + Z;
    const B = this.p[X + 1]! + Y;
    const BA = this.p[B]! + Z;
    const BB = this.p[B + 1]! + Z;
    return lerp(
      lerp(
        lerp(grad3(this.p[AA]!, xf, yf, zf), grad3(this.p[BA]!, xf - 1, yf, zf), u),
        lerp(grad3(this.p[AB]!, xf, yf - 1, zf), grad3(this.p[BB]!, xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(
          grad3(this.p[AA + 1]!, xf, yf, zf - 1),
          grad3(this.p[BA + 1]!, xf - 1, yf, zf - 1),
          u,
        ),
        lerp(
          grad3(this.p[AB + 1]!, xf, yf - 1, zf - 1),
          grad3(this.p[BB + 1]!, xf - 1, yf - 1, zf - 1),
          u,
        ),
        v,
      ),
      w,
    );
  }
}
