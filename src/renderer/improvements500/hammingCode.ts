// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hamming(7,4) error-correcting code. Encodes 4 data bits into 7 bits
 * with 3 parity bits and can correct any single-bit error.
 */

/** Encode 4 data bits (LSB-first) into a 7-bit Hamming(7,4) codeword. */
export function hammingEncode4(data: number): number {
  const d1 = (data >> 0) & 1;
  const d2 = (data >> 1) & 1;
  const d3 = (data >> 2) & 1;
  const d4 = (data >> 3) & 1;
  const p1 = d1 ^ d2 ^ d4;
  const p2 = d1 ^ d3 ^ d4;
  const p3 = d2 ^ d3 ^ d4;
  // Layout: [p1, p2, d1, p3, d2, d3, d4] in positions 1..7
  return (
    (p1 << 0) |
    (p2 << 1) |
    (d1 << 2) |
    (p3 << 3) |
    (d2 << 4) |
    (d3 << 5) |
    (d4 << 6)
  );
}

/** Decode a 7-bit codeword. Returns the data nibble plus a `corrected` flag. */
export function hammingDecode7(codeword: number): { data: number; corrected: boolean } {
  let cw = codeword & 0x7f;
  const bit = (i: number): number => (cw >> (i - 1)) & 1;
  const c1 = bit(1) ^ bit(3) ^ bit(5) ^ bit(7);
  const c2 = bit(2) ^ bit(3) ^ bit(6) ^ bit(7);
  const c4 = bit(4) ^ bit(5) ^ bit(6) ^ bit(7);
  const syndrome = (c4 << 2) | (c2 << 1) | c1;
  let corrected = false;
  if (syndrome !== 0 && syndrome <= 7) {
    cw ^= 1 << (syndrome - 1);
    corrected = true;
  }
  const d1 = (cw >> 2) & 1;
  const d2 = (cw >> 4) & 1;
  const d3 = (cw >> 5) & 1;
  const d4 = (cw >> 6) & 1;
  return { data: d1 | (d2 << 1) | (d3 << 2) | (d4 << 3), corrected };
}
