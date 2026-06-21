// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Vision — Smart Mask (luminosity masking)
 * -----------------------------------------------------------------------------
 * Build a selection mask from a pixel-brightness range — the "luminosity mask"
 * staple of pro photo editing (select shadows / midtones / highlights to grade
 * them independently). Pure (operates on raw RGBA bytes -> Uint8 coverage mask),
 * so it is reusable + unit-testable; PRISM builds a real selection from it.
 */

export type LumaBand = 'shadows' | 'midtones' | 'highlights';

/** Inclusive luma ranges (0..255) for the three standard bands. */
export const LUMA_BANDS: Record<LumaBand, [number, number]> = {
  shadows: [0, 85],
  midtones: [86, 170],
  highlights: [171, 255],
};

/** Rec.709 luma of an RGB triplet (0..255 in, 0..255 out). */
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Build a `pixelCount`-length coverage mask (255 = selected) where each pixel's
 * Rec.709 luma falls within [low, high]. `data` is RGBA bytes (length >= 4*count).
 */
export function buildLuminanceMask(
  data: ArrayLike<number>, pixelCount: number, low: number, high: number,
): Uint8Array {
  const mask = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const y = luma709(data[i], data[i + 1], data[i + 2]);
    if (y >= low && y <= high) mask[p] = 255;
  }
  return mask;
}

/** Convenience: build a mask for one of the standard bands. */
export function buildBandMask(data: ArrayLike<number>, pixelCount: number, band: LumaBand): Uint8Array {
  const [low, high] = LUMA_BANDS[band];
  return buildLuminanceMask(data, pixelCount, low, high);
}
