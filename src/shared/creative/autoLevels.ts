// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Auto-levels / auto-contrast (ROADMAP-600 #174 auto-enhance, #186 auto-levels).
 * A real engine: per-channel histogram analysis, clip a small percentile off the
 * shadows and highlights, then linearly stretch the remaining range to full
 * [0,255]. This is the classic "auto levels" that also neutralises colour casts
 * (each channel is stretched independently). Pure, deterministic over an RGBA
 * byte array, fully unit-testable; no ML.
 */

// DEX v6.0 — creative: auto-levels

export interface AutoLevelsOptions {
  /** Percentage of pixels to clip at each end of each channel. Default 0.5. */
  clipPercent?: number;
}

/** Build a 256-entry histogram for one channel offset (0=R,1=G,2=B). */
function histogram(src: ArrayLike<number>, pixels: number, offset: number): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < pixels; i++) h[src[i * 4 + offset] & 255]++;
  return h;
}

/** Lowest value with cumulative count >= target (from the dark end). */
function lowCut(h: Uint32Array, target: number): number {
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += h[v]; if (acc >= target) return v; }
  return 0;
}
/** Highest value with cumulative count >= target (from the bright end). */
function highCut(h: Uint32Array, target: number): number {
  let acc = 0;
  for (let v = 255; v >= 0; v--) { acc += h[v]; if (acc >= target) return v; }
  return 255;
}

/** A 256-entry LUT that maps [lo,hi] linearly onto [0,255] (identity if hi<=lo). */
function stretchLUT(lo: number, hi: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  if (hi <= lo) { for (let v = 0; v < 256; v++) lut[v] = v; return lut; }
  const scale = 255 / (hi - lo);
  for (let v = 0; v < 256; v++) lut[v] = Math.round((v - lo) * scale);
  return lut;
}

/**
 * Apply auto-levels to an RGBA image. Each colour channel is independently
 * percentile-clipped and stretched to full range; alpha is preserved.
 */
export function autoLevels(
  src: ArrayLike<number>,
  width: number,
  height: number,
  opts: AutoLevelsOptions = {},
): Uint8ClampedArray {
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  if (pixels <= 0) return out;

  const clip = Math.max(0, Math.min(20, opts.clipPercent ?? 0.5));
  const target = Math.max(1, Math.floor((clip / 100) * pixels));

  const luts: Uint8ClampedArray[] = [];
  for (let c = 0; c < 3; c++) {
    const h = histogram(src, pixels, c);
    luts.push(stretchLUT(lowCut(h, target), highCut(h, target)));
  }

  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    out[o] = luts[0][src[o] & 255];
    out[o + 1] = luts[1][src[o + 1] & 255];
    out[o + 2] = luts[2][src[o + 2] & 255];
    out[o + 3] = src[o + 3];
  }
  return out;
}
