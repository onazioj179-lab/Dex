// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Edge-preserving image denoise (ROADMAP-600 #170 denoise, #178 blemish).
 * A REAL engine — per-channel median filtering over a square window. Median is
 * the classic edge-preserving denoiser: it kills salt-and-pepper / impulse
 * noise and outliers while keeping hard edges sharp (unlike a Gaussian blur).
 * No ML — pure, deterministic over an RGBA byte array, fully unit-testable;
 * the app feeds it ImageData pixels and writes the result back.
 */

// DEX v6.0 — creative: image denoise

/**
 * Median-filter an RGBA image. `radius` is the window half-size (1 → 3×3,
 * 2 → 5×5). Alpha is passed through unchanged. Clamp-to-edge at borders.
 */
export function medianDenoise(
  src: ArrayLike<number>,
  width: number,
  height: number,
  radius = 1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0) return out;
  const r = Math.max(1, Math.round(radius));
  const win = (2 * r + 1) * (2 * r + 1);
  const mid = win >> 1;
  const rs = new Array<number>(win);
  const gs = new Array<number>(win);
  const bs = new Array<number>(win);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let k = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy < 0 ? 0 : y + dy >= height ? height - 1 : y + dy;
        const rowBase = yy * width;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx < 0 ? 0 : x + dx >= width ? width - 1 : x + dx;
          const idx = (rowBase + xx) * 4;
          rs[k] = src[idx]; gs[k] = src[idx + 1]; bs[k] = src[idx + 2]; k++;
        }
      }
      rs.sort(numeric); gs.sort(numeric); bs.sort(numeric);
      const o = (y * width + x) * 4;
      out[o] = rs[mid]; out[o + 1] = gs[mid]; out[o + 2] = bs[mid];
      out[o + 3] = src[o + 3]; // preserve original alpha
    }
  }
  return out;
}

function numeric(a: number, b: number): number { return a - b; }

/** Apply the denoiser N times for a stronger (still edge-preserving) result. */
export function denoiseImage(
  src: ArrayLike<number>,
  width: number,
  height: number,
  opts: { radius?: number; passes?: number } = {},
): Uint8ClampedArray {
  const passes = Math.max(1, Math.round(opts.passes ?? 1));
  let cur = medianDenoise(src, width, height, opts.radius ?? 1);
  for (let p = 1; p < passes; p++) cur = medianDenoise(cur, width, height, opts.radius ?? 1);
  return cur;
}
