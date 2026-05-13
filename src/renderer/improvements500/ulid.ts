// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ULID generator (Crockford base32, lexicographically sortable, 26 chars).
 * Spec: https://github.com/ulid/spec
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now?: number, randomBytes?: () => Uint8Array): string {
  const t = now ?? Date.now();
  if (!Number.isInteger(t) || t < 0 || t > 0xffffffffffff) {
    throw new Error('ulid: timestamp must fit in 48 bits');
  }
  const rand = randomBytes ?? defaultRandomBytes;
  return encodeTime(t) + encodeRandom(rand());
}

function encodeTime(ms: number): string {
  let out = '';
  let n = ms;
  for (let i = 0; i < 10; i += 1) {
    out = ALPHABET[n % 32]! + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  if (bytes.length < 10) throw new Error('ulid: randomBytes must return >= 10 bytes');
  let out = '';
  // 80 random bits -> 16 base32 chars. Read 5 bits at a time from a bit buffer.
  let buf = 0;
  let bits = 0;
  let pos = 0;
  while (out.length < 16) {
    while (bits < 5 && pos < bytes.length) {
      buf = (buf << 8) | (bytes[pos++] ?? 0);
      bits += 8;
    }
    bits -= 5;
    const idx = (buf >>> bits) & 31;
    out += ALPHABET[idx];
  }
  return out;
}

function defaultRandomBytes(): Uint8Array {
  const out = new Uint8Array(10);
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g && typeof g.getRandomValues === 'function') {
    g.getRandomValues(out);
  } else {
    for (let i = 0; i < out.length; i += 1) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}
