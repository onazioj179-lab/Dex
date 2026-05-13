// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * mu-law and A-law nonlinear companding for 8-bit telephony-style audio.
 * Encode/decode functions operate on per-sample Float32 in [-1, 1].
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const MU = 255;

export function muLawEncode(sample: number): number {
  const sign = sample < 0 ? 1 : 0;
  const abs = Math.min(1, Math.abs(sample));
  const compressed = Math.log1p(MU * abs) / Math.log1p(MU);
  const byte = Math.round(compressed * 127);
  return sign === 1 ? 0xff - byte : 0x7f - byte;
}

export function muLawDecode(byte: number): number {
  const inverted = 0xff - (byte & 0xff);
  const sign = (inverted & 0x80) === 0 ? -1 : 1;
  const magnitude = inverted & 0x7f;
  const compressed = magnitude / 127;
  const value = ((1 + MU) ** compressed - 1) / MU;
  return sign * value;
}
