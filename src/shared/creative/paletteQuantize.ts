// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Palette quantization (Prism/Canvas — extract a swatch palette from an image).
 * Coarse uniform bucketing of RGBA pixels: reduce each channel's precision,
 * tally buckets, and return the most-populous as averaged representative colors.
 * Pure: no DOM/Canvas, so it runs in a worker and is unit-testable.
 */

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface Bucket { rs: number; gs: number; bs: number; n: number }

/**
 * Extract up to `maxColors` dominant colors from RGBA bytes. `bits` controls
 * bucket coarseness (bits per channel; 4 → 16 levels/channel). Fully transparent
 * pixels (alpha 0) are ignored.
 */
export function quantizePalette(rgba: ArrayLike<number>, maxColors = 8, bits = 4): PaletteColor[] {
  const shift = 8 - Math.min(8, Math.max(1, bits));
  const buckets = new Map<number, Bucket>();

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue; // skip fully transparent
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const key = ((r >> shift) << 16) | ((g >> shift) << 8) | (b >> shift);
    const bucket = buckets.get(key);
    if (bucket) { bucket.rs += r; bucket.gs += g; bucket.bs += b; bucket.n++; }
    else buckets.set(key, { rs: r, gs: g, bs: b, n: 1 });
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, Math.max(0, maxColors))
    .map((bk) => ({
      r: Math.round(bk.rs / bk.n),
      g: Math.round(bk.gs / bk.n),
      b: Math.round(bk.bs / bk.n),
      count: bk.n,
    }));
}

/** The single most dominant color, or null for an empty/transparent image. */
export function dominantColor(rgba: ArrayLike<number>, bits = 4): PaletteColor | null {
  return quantizePalette(rgba, 1, bits)[0] ?? null;
}
