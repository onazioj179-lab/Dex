// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CRC-16/CCITT-FALSE checksum (poly 0x1021, init 0xFFFF, no reflect).
 */

const TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = (i << 8) & 0xffff;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    t[i] = c;
  }
  return t;
})();

export function crc16(input: string | Uint8Array): number {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = ((crc << 8) ^ TABLE[((crc >> 8) ^ bytes[i]!) & 0xff]!) & 0xffff;
  }
  return crc;
}

export function crc16Hex(input: string | Uint8Array): string {
  return crc16(input).toString(16).padStart(4, '0');
}
