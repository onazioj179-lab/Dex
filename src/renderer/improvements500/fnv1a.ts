// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 32-bit FNV-1a hash. Fast, non-cryptographic hash suitable for
 * hash-table keys and short-string fingerprinting.
 */

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function fnv1a32(input: string | Uint8Array): number {
  let h = OFFSET;
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i) & 0xff;
      h = Math.imul(h, PRIME);
    }
  } else {
    for (let i = 0; i < input.length; i += 1) {
      h ^= input[i] ?? 0;
      h = Math.imul(h, PRIME);
    }
  }
  return h >>> 0;
}

export function fnv1a32Hex(input: string | Uint8Array): string {
  return fnv1a32(input).toString(16).padStart(8, '0');
}
