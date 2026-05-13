// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * RC4 (ARC4) stream cipher. EDUCATIONAL / TEST FIXTURE ONLY.
 * RC4 is cryptographically broken; do NOT use for new security-sensitive code.
 * Useful here for reproducible byte streams keyed by a small secret.
 */

export function arc4Stream(key: Uint8Array, length: number): Uint8Array {
  if (key.length === 0) throw new Error('arc4Stream: key must be non-empty');
  if (!Number.isInteger(length) || length < 0) throw new Error('arc4Stream: length must be non-negative integer');
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + (s[i] ?? 0) + (key[i % key.length] ?? 0)) & 0xff;
    const t = s[i]!; s[i] = s[j]!; s[j] = t;
  }
  let i = 0; j = 0;
  const out = new Uint8Array(length);
  for (let n = 0; n < length; n += 1) {
    i = (i + 1) & 0xff;
    j = (j + (s[i] ?? 0)) & 0xff;
    const t = s[i]!; s[i] = s[j]!; s[j] = t;
    out[n] = s[((s[i] ?? 0) + (s[j] ?? 0)) & 0xff]!;
  }
  return out;
}

export function arc4Encrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  const ks = arc4Stream(key, data.length);
  const out = new Uint8Array(data.length);
  for (let n = 0; n < data.length; n += 1) out[n] = (data[n] ?? 0) ^ (ks[n] ?? 0);
  return out;
}
