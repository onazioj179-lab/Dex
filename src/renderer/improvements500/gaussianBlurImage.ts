// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Separable 2D Gaussian blur on a single-channel image. Applies a 1D
 * Gaussian kernel horizontally then vertically. Edges use clamp-to-edge.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
function buildKernel(sigma: number): number[] {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const size = 2 * radius + 1;
  const kernel = new Array<number>(size);
  let sum = 0;
  const denom = 2 * sigma * sigma;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / denom);
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] = kernel[i]! / sum;
  return kernel;
}

export function gaussianBlurImage(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  sigma: number,
): Uint8ClampedArray {
  if (sigma <= 0) throw new RangeError('gaussianBlurImage: sigma must be positive');
  const kernel = buildKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        const xx = Math.min(width - 1, Math.max(0, x + i));
        acc += src[y * width + xx]! * kernel[i + radius]!;
      }
      tmp[y * width + x] = acc;
    }
  }
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        const yy = Math.min(height - 1, Math.max(0, y + i));
        acc += tmp[yy * width + x]! * kernel[i + radius]!;
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}
