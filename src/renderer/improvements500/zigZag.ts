// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ZigZag varint encoding: maps signed 32-bit integers to unsigned in a way
 * that small absolute values produce small unsigned codes (good for varint
 * compression). Inverse pair: encode/decode.
 */

export function zigZagEncode(n: number): number {
  if (!Number.isInteger(n)) throw new Error('zigZagEncode: requires integer');
  if (n < -0x80000000 || n > 0x7fffffff) throw new Error('zigZagEncode: out of int32 range');
  return ((n << 1) ^ (n >> 31)) >>> 0;
}

export function zigZagDecode(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error('zigZagDecode: requires uint32');
  }
  return (n >>> 1) ^ -(n & 1);
}
