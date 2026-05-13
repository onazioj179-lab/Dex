// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MurmurHash3 x86 32-bit variant. Fast non-cryptographic hash with
 * good avalanche. Suitable for hash tables, bloom filter mixing, etc.
 */

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

export function murmurHash3(input: string | Uint8Array, seed = 0): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const len = bytes.length;
  const nblocks = Math.floor(len / 4);
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  for (let i = 0; i < nblocks; i += 1) {
    const off = i * 4;
    let k1 =
      (bytes[off]! |
        (bytes[off + 1]! << 8) |
        (bytes[off + 2]! << 16) |
        (bytes[off + 3]! << 24)) >>>
      0;
    k1 = Math.imul(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
    h1 = rotl32(h1, 13);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }
  let k1 = 0;
  const tail = nblocks * 4;
  const rem = len & 3;
  if (rem >= 3) k1 ^= bytes[tail + 2]! << 16;
  if (rem >= 2) k1 ^= bytes[tail + 1]! << 8;
  if (rem >= 1) {
    k1 ^= bytes[tail]!;
    k1 = Math.imul(k1, c1);
    k1 = rotl32(k1, 15);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}
