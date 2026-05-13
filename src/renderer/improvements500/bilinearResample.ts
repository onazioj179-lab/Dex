// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Bilinear resample of a 2D image (Float32Array, row-major, single channel).
export function bilinearResample(
  src: Float32Array | ReadonlyArray<number>,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Float32Array {
  const out = new Float32Array(dstWidth * dstHeight);
  if (srcWidth === 0 || srcHeight === 0 || dstWidth === 0 || dstHeight === 0) return out;
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;
  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = (dy + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = sy - y0;
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = (dx + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = sx - x0;
      const a = src[y0 * srcWidth + x0];
      const b = src[y0 * srcWidth + x1];
      const c = src[y1 * srcWidth + x0];
      const d = src[y1 * srcWidth + x1];
      const top = a * (1 - fx) + b * fx;
      const bot = c * (1 - fx) + d * fx;
      out[dy * dstWidth + dx] = top * (1 - fy) + bot * fy;
    }
  }
  return out;
}
