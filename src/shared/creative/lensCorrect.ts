// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Lens correction (DEX v6 Track G). Single-pass radial distortion + transverse
 * chromatic-aberration correction + vignette over RGBA pixel data. Pure +
 * unit-tested; Prism's Lens Correction panel uses it.
 *
 * The key fix over the previous inline version: chromatic aberration is modeled
 * as a per-channel radial magnification difference (red and blue sampled at
 * slightly different radii than green) -- which is what actually produces /
 * removes color fringing. The old code applied one geometric distortion to all
 * three channels, so the "Chromatic Ab." control did nothing perceptible.
 */

export interface LensCorrectionOptions {
  /** Radial geometric distortion coefficient (barrel/pincushion). 0 = none. */
  distortion?: number;
  /** Transverse chromatic-aberration strength (per-channel radial offset). 0 = none. */
  chromatic?: number;
  /** Vignette factor; negative darkens edges, positive brightens. 0 = none. */
  vignette?: number;
}

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Apply lens correction to RGBA `data` (length = width*height*4). Returns a new
 * Uint8ClampedArray. Out-of-bounds samples become transparent black. With all
 * options 0 the output equals the input (identity).
 */
export function applyLensCorrection(
  data: Uint8ClampedArray | number[],
  width: number,
  height: number,
  opts: LensCorrectionOptions = {},
): Uint8ClampedArray {
  const { distortion = 0, chromatic = 0, vignette = 0 } = opts;
  const out = new Uint8ClampedArray(data.length);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r2 = dx * dx + dy * dy;

      const distort = 1 + distortion * r2;
      const vignScale = 1 + vignette * r2;
      const rScale = distort * (1 + chromatic * r2);
      const gScale = distort;
      const bScale = distort * (1 - chromatic * r2);

      const sample = (scale: number, channel: number): number => {
        const sx = Math.round(cx + dx * scale * maxR);
        const sy = Math.round(cy + dy * scale * maxR);
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          return data[(sy * width + sx) * 4 + channel];
        }
        return -1; // out of bounds
      };

      const r = sample(rScale, 0);
      const g = sample(gScale, 1);
      const b = sample(bScale, 2);
      const a = sample(gScale, 3);

      out[di] = r < 0 ? 0 : clamp8(r * vignScale);
      out[di + 1] = g < 0 ? 0 : clamp8(g * vignScale);
      out[di + 2] = b < 0 ? 0 : clamp8(b * vignScale);
      out[di + 3] = a < 0 ? 0 : a;
    }
  }

  return out;
}
