// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * High-quality image resampler (ROADMAP-600 #167 upscale, #185 smart resize).
 * A REAL engine — separable convolution with a Lanczos-3 (or bilinear) kernel,
 * proper sub-pixel centring and clamp-to-edge. This is genuine high-quality
 * resampling, NOT ML super-resolution: it interpolates, it does not invent
 * detail. Pure + deterministic over an RGBA byte array, so it's fully unit-
 * testable headlessly; the app feeds it ImageData pixels and writes back.
 */

// DEX v6.0 — creative: image resampler

export type ResampleKernel = 'lanczos3' | 'bilinear';

function lanczos3(x: number): number {
  if (x === 0) return 1;
  if (x <= -3 || x >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

function triangle(x: number): number {
  const a = Math.abs(x);
  return a < 1 ? 1 - a : 0;
}

function kernelFn(k: ResampleKernel): (x: number) => number {
  return k === 'bilinear' ? triangle : lanczos3;
}
function kernelSupport(k: ResampleKernel): number {
  return k === 'bilinear' ? 1 : 3;
}

type Weight = [src: number, w: number];

/**
 * Precompute, for each destination index, the list of source samples and their
 * normalised weights. When downscaling (scale>1) the kernel is widened to act
 * as a low-pass filter (anti-alias); when upscaling it interpolates.
 */
function buildWeights(srcLen: number, dstLen: number, k: ResampleKernel): Weight[][] {
  const fn = kernelFn(k);
  const sup = kernelSupport(k);
  const scale = srcLen / dstLen;
  const filterScale = scale > 1 ? scale : 1;
  const radius = sup * filterScale;
  const rows: Weight[][] = new Array(dstLen);

  for (let d = 0; d < dstLen; d++) {
    const center = (d + 0.5) * scale - 0.5;
    const left = Math.ceil(center - radius);
    const right = Math.floor(center + radius);
    const weights: Weight[] = [];
    let sum = 0;
    for (let s = left; s <= right; s++) {
      const w = fn((s - center) / filterScale);
      if (w === 0) continue;
      const clamped = s < 0 ? 0 : s >= srcLen ? srcLen - 1 : s;
      weights.push([clamped, w]);
      sum += w;
    }
    if (sum !== 0) for (const wp of weights) wp[1] /= sum;
    rows[d] = weights;
  }
  return rows;
}

/**
 * Resample an RGBA image to new dimensions. `src` is row-major RGBA bytes
 * (length = srcW*srcH*4). Returns a fresh `Uint8ClampedArray` of dstW*dstH*4
 * (assignment clamps/rounds each channel to 0..255).
 */
export function resampleImage(
  src: ArrayLike<number>,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  kernel: ResampleKernel = 'lanczos3',
): Uint8ClampedArray {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return new Uint8ClampedArray(0);

  // Horizontal pass: srcW -> dstW into a float intermediate (dstW x srcH).
  const hW = buildWeights(srcW, dstW, kernel);
  const tmp = new Float32Array(dstW * srcH * 4);
  for (let y = 0; y < srcH; y++) {
    const rowBase = y * srcW;
    for (let x = 0; x < dstW; x++) {
      const ws = hW[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < ws.length; i++) {
        const idx = (rowBase + ws[i][0]) * 4;
        const w = ws[i][1];
        r += src[idx] * w; g += src[idx + 1] * w; b += src[idx + 2] * w; a += src[idx + 3] * w;
      }
      const o = (y * dstW + x) * 4;
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
  }

  // Vertical pass: srcH -> dstH into the clamped output.
  const vW = buildWeights(srcH, dstH, kernel);
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const ws = vW[y];
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < ws.length; i++) {
        const idx = (ws[i][0] * dstW + x) * 4;
        const w = ws[i][1];
        r += tmp[idx] * w; g += tmp[idx + 1] * w; b += tmp[idx + 2] * w; a += tmp[idx + 3] * w;
      }
      const o = (y * dstW + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return out;
}

/** Convenience: integer-factor upscale (e.g. 2× / 4×). */
export function upscaleByFactor(
  src: ArrayLike<number>,
  srcW: number,
  srcH: number,
  factor: number,
  kernel: ResampleKernel = 'lanczos3',
): { data: Uint8ClampedArray; width: number; height: number } {
  const f = Math.max(1, Math.round(factor));
  const width = srcW * f;
  const height = srcH * f;
  return { data: resampleImage(src, srcW, srcH, width, height, kernel), width, height };
}
