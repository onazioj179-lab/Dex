// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { hmacSha256 } from './hmacSha256';

// PBKDF2-HMAC-SHA256 (RFC 2898). Returns dkLen bytes.
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Uint8Array {
  const hLen = 32;
  const blocks = Math.ceil(dkLen / hLen);
  const out = new Uint8Array(blocks * hLen);
  const block = new Uint8Array(salt.length + 4);
  block.set(salt);
  for (let i = 1; i <= blocks; i++) {
    block[salt.length] = (i >>> 24) & 0xff;
    block[salt.length + 1] = (i >>> 16) & 0xff;
    block[salt.length + 2] = (i >>> 8) & 0xff;
    block[salt.length + 3] = i & 0xff;
    let u = hmacSha256(password, block);
    const t = new Uint8Array(u);
    for (let c = 1; c < iterations; c++) {
      u = hmacSha256(password, u);
      for (let k = 0; k < hLen; k++) t[k] ^= u[k];
    }
    out.set(t, (i - 1) * hLen);
  }
  return out.slice(0, dkLen);
}
