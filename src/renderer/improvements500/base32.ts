// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RFC 4648 base32 encode/decode (uppercase alphabet, '=' padding).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const DECODE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i += 1) map[ALPHABET[i]] = i;
  return map;
})();

export function encodeBase32(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      const idx = (value >>> (bits - 5)) & 31;
      output += ALPHABET[idx];
      bits -= 5;
    }
  }
  if (bits > 0) {
    const idx = (value << (5 - bits)) & 31;
    output += ALPHABET[idx];
  }
  while (output.length % 8 !== 0) output += '=';
  return output;
}

export function decodeBase32(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (!(ch in DECODE_MAP)) throw new Error(`decodeBase32: invalid char "${ch}"`);
    value = (value << 5) | DECODE_MAP[ch];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}
