// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Gray-world white balance. Scales each channel so its mean equals the
 * overall mean. Operates on interleaved RGB (or RGBA) bytes.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function whiteBalanceGray(
  rgba: Uint8ClampedArray | Uint8Array,
  channels: 3 | 4 = 4,
): Uint8ClampedArray {
  if (rgba.length % channels !== 0) throw new Error('whiteBalanceGray: length not multiple of channels');
  const pixels = rgba.length / channels;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < rgba.length; i += channels) {
    sumR += rgba[i]!;
    sumG += rgba[i + 1]!;
    sumB += rgba[i + 2]!;
  }
  const meanR = sumR / pixels;
  const meanG = sumG / pixels;
  const meanB = sumB / pixels;
  const gray = (meanR + meanG + meanB) / 3;
  const sR = meanR > 0 ? gray / meanR : 1;
  const sG = meanG > 0 ? gray / meanG : 1;
  const sB = meanB > 0 ? gray / meanB : 1;
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += channels) {
    out[i] = rgba[i]! * sR;
    out[i + 1] = rgba[i + 1]! * sG;
    out[i + 2] = rgba[i + 2]! * sB;
    if (channels === 4) out[i + 3] = rgba[i + 3]!;
  }
  return out;
}
