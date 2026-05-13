// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UUIDv7 generator (RFC 9562). Time-ordered: the first 48 bits encode the
 * Unix millisecond timestamp, then a 4-bit version, 12 bits of randomness,
 * the variant nibble, and 62 bits of randomness. Supports injectable `now`
 * and `random` for deterministic tests.
 */

export interface UuidV7Options {
  now?: () => number;
  random?: () => number;
}

export function uuidV7(opts: UuidV7Options = {}): string {
  const now = opts.now ? opts.now() : Date.now();
  const rand = opts.random ?? Math.random;
  const bytes = new Uint8Array(16);
  // 48-bit timestamp (big-endian)
  const ms = Math.floor(now);
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms >>> 24) & 0xff;
  bytes[3] = (ms >>> 16) & 0xff;
  bytes[4] = (ms >>> 8) & 0xff;
  bytes[5] = ms & 0xff;
  // Random for the rest
  for (let i = 6; i < 16; i += 1) bytes[i] = Math.floor(rand() * 256) & 0xff;
  // Version 7 (top nibble of byte 6)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // Variant 10xxxxxx (top two bits of byte 8)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function formatUuid(b: Uint8Array): string {
  const h = (n: number): string => n.toString(16).padStart(2, '0');
  return `${h(b[0]!)}${h(b[1]!)}${h(b[2]!)}${h(b[3]!)}-${h(b[4]!)}${h(b[5]!)}-${h(b[6]!)}${h(b[7]!)}-${h(b[8]!)}${h(b[9]!)}-${h(b[10]!)}${h(b[11]!)}${h(b[12]!)}${h(b[13]!)}${h(b[14]!)}${h(b[15]!)}`;
}
