// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Floyd-Steinberg dithering on a single-channel Float32Array (values in [0,1]).
// Returns a Uint8Array of 0/255 quantized values.
export function ditherFloydSteinberg(
  input: Float32Array | ReadonlyArray<number>,
  width: number,
  height: number,
): Uint8Array {
  const buf = new Float32Array(width * height);
  for (let i = 0; i < buf.length; i++) buf[i] = input[i];
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const newPixel = old < 0.5 ? 0 : 1;
      out[idx] = newPixel * 255;
      const err = old - newPixel;
      if (x + 1 < width) buf[idx + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buf[idx + width - 1] += (err * 3) / 16;
        buf[idx + width] += (err * 5) / 16;
        if (x + 1 < width) buf[idx + width + 1] += err / 16;
      }
    }
  }
  return out;
}
