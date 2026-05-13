// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Daniel J. Bernstein's djb2 string hash. Trivially small, decent for
 * small string keys; not collision-resistant.
 */

export function djb2Hash(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let h = 5381;
  for (let i = 0; i < bytes.length; i += 1) {
    h = ((h << 5) + h + bytes[i]!) >>> 0;
  }
  return h >>> 0;
}
