// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Hex (base16) encode/decode for binary buffers. Lowercase output by default.
 */

const HEX = '0123456789abcdef';

export function encodeHex(bytes: Uint8Array, upper = false): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    out += HEX[(b >>> 4) & 0xf];
    out += HEX[b & 0xf];
  }
  return upper ? out.toUpperCase() : out;
}

export function decodeHex(input: string): Uint8Array {
  if (typeof input !== 'string') throw new Error('decodeHex: input must be string');
  const s = input.trim();
  if (s.length % 2 !== 0) throw new Error('decodeHex: odd-length hex string');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    const hi = hexNibble(s.charCodeAt(i));
    const lo = hexNibble(s.charCodeAt(i + 1));
    if (hi < 0 || lo < 0) throw new Error(`decodeHex: invalid char at ${i}`);
    out[i / 2] = (hi << 4) | lo;
  }
  return out;
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 87;
  if (code >= 65 && code <= 70) return code - 55;
  return -1;
}
