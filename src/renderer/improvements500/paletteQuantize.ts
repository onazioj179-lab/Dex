// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Median-cut palette quantization. Input: array of [r,g,b] in [0,255].
// Output: array of K representative colors.
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function paletteQuantize(pixels: ReadonlyArray<Rgb>, k: number): Rgb[] {
  if (pixels.length === 0 || k <= 0) return [];
  let buckets: Rgb[][] = [pixels.slice()];
  while (buckets.length < k) {
    let bestIdx = -1;
    let bestRange = -1;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      let rmin = 255,
        rmax = 0,
        gmin = 255,
        gmax = 0,
        bmin = 255,
        bmax = 0;
      for (const p of b) {
        if (p.r < rmin) rmin = p.r;
        if (p.r > rmax) rmax = p.r;
        if (p.g < gmin) gmin = p.g;
        if (p.g > gmax) gmax = p.g;
        if (p.b < bmin) bmin = p.b;
        if (p.b > bmax) bmax = p.b;
      }
      const range = Math.max(rmax - rmin, gmax - gmin, bmax - bmin);
      if (range > bestRange) {
        bestRange = range;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const bucket = buckets[bestIdx];
    let rmin = 255,
      rmax = 0,
      gmin = 255,
      gmax = 0,
      bmin = 255,
      bmax = 0;
    for (const p of bucket) {
      if (p.r < rmin) rmin = p.r;
      if (p.r > rmax) rmax = p.r;
      if (p.g < gmin) gmin = p.g;
      if (p.g > gmax) gmax = p.g;
      if (p.b < bmin) bmin = p.b;
      if (p.b > bmax) bmax = p.b;
    }
    const dr = rmax - rmin;
    const dg = gmax - gmin;
    const db = bmax - bmin;
    const axis: keyof Rgb = dr >= dg && dr >= db ? 'r' : dg >= db ? 'g' : 'b';
    bucket.sort((a, b2) => a[axis] - b2[axis]);
    const mid = bucket.length >> 1;
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    buckets.splice(bestIdx, 1, left, right);
  }
  return buckets.map((b) => {
    let r = 0,
      g = 0,
      bl = 0;
    for (const p of b) {
      r += p.r;
      g += p.g;
      bl += p.b;
    }
    return { r: Math.round(r / b.length), g: Math.round(g / b.length), b: Math.round(bl / b.length) };
  });
}
