// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CRC-8 (polynomial 0x07, init 0x00). Common SMBus / 1-Wire variant.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
const TABLE = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 0x80) !== 0 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
    t[i] = c;
  }
  return t;
})();

export function crc8(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = TABLE[(crc ^ bytes[i]) & 0xff]!;
  }
  return crc;
}

export function crc8Hex(input: string | Uint8Array): string {
  return crc8(input).toString(16).padStart(2, '0');
}
