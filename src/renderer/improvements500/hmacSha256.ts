// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { sha256 } from './sha256';

const BLOCK_SIZE = 64;

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > BLOCK_SIZE) k = sha256(k);
  if (k.length < BLOCK_SIZE) {
    const padded = new Uint8Array(BLOCK_SIZE);
    padded.set(k);
    k = padded;
  }
  const oKey = new Uint8Array(BLOCK_SIZE);
  const iKey = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    oKey[i] = k[i] ^ 0x5c;
    iKey[i] = k[i] ^ 0x36;
  }
  const inner = new Uint8Array(iKey.length + message.length);
  inner.set(iKey);
  inner.set(message, iKey.length);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(oKey.length + innerHash.length);
  outer.set(oKey);
  outer.set(innerHash, oKey.length);
  return sha256(outer);
}
