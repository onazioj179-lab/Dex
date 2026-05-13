// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Jenkins one-at-a-time hash. Simple, fast, decent avalanche - useful
 * for hash tables when MurmurHash overhead isn't warranted.
 */

export function jenkinsHash(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let h = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h = (h + bytes[i]!) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h ^= h >>> 6;
  }
  h = (h + (h << 3)) >>> 0;
  h ^= h >>> 11;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}
