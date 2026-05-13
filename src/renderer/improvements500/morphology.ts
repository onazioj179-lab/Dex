// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Binary morphological erosion and dilation with a 3x3 square structuring
 * element. Input is treated as binary (0 = background, non-zero = foreground).
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
function neighborhoodMin(input: Uint8Array, w: number, h: number, x: number, y: number): number {
  let m = 255;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
      const v = input[yy * w + xx]!;
      if (v < m) m = v;
    }
  }
  return m;
}

function neighborhoodMax(input: Uint8Array, w: number, h: number, x: number, y: number): number {
  let m = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
      const v = input[yy * w + xx]!;
      if (v > m) m = v;
    }
  }
  return m;
}

export function erodeBinary(input: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(input.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = neighborhoodMin(input, w, h, x, y);
    }
  }
  return out;
}

export function dilateBinary(input: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(input.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = neighborhoodMax(input, w, h, x, y);
    }
  }
  return out;
}
