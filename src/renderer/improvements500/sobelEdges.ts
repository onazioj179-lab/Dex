// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Sobel edge magnitude on a 2D grayscale image (Float32Array, row-major).
export interface SobelResult {
  magnitude: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
}

export function sobelEdges(
  image: Float32Array | ReadonlyArray<number>,
  width: number,
  height: number,
): SobelResult {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const magnitude = new Float32Array(width * height);
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return image[cy * width + cx];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const sx = -tl - 2 * l - bl + tr + 2 * r + br;
      const sy = -tl - 2 * t - tr + bl + 2 * b + br;
      const idx = y * width + x;
      gx[idx] = sx;
      gy[idx] = sy;
      magnitude[idx] = Math.hypot(sx, sy);
    }
  }
  return { magnitude, gx, gy };
}
