// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Base58 encoding using the Bitcoin alphabet (no 0/O/I/l). Operates on
 * arbitrary byte arrays and preserves leading zero bytes as leading '1's.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i += 1) MAP[ALPHABET.charCodeAt(i)] = i;

export function base58Encode(input: Uint8Array): string {
  if (input.length === 0) return '';
  let zeros = 0;
  while (zeros < input.length && input[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < input.length; i += 1) {
    let carry = input[i] ?? 0;
    for (let d = 0; d < digits.length; d += 1) {
      carry += (digits[d] ?? 0) << 8;
      digits[d] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let z = 0; z < zeros; z += 1) out += '1';
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]!];
  return out;
}

export function base58Decode(input: string): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < input.length && input[zeros] === '1') zeros += 1;
  const bytes = [0];
  for (let i = zeros; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const v = code < 128 ? MAP[code] : -1;
    if (v === undefined || v === -1) throw new Error(`base58Decode: invalid char "${input[i]}"`);
    let carry = v;
    for (let b = 0; b < bytes.length; b += 1) {
      carry += (bytes[b] ?? 0) * 58;
      bytes[b] = carry & 0xff;
      carry >>>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  let pos = zeros;
  for (let i = bytes.length - 1; i >= 0; i -= 1) out[pos++] = bytes[i] ?? 0;
  return out;
}
