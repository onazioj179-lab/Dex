// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/*
 * DEX - SimHash 64-bit similarity hashing (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

// FNV-1a 64 (using two 32-bit halves to avoid BigInt in the inner loop).
function fnv64(s: string): { hi: number; lo: number } {
  let hi = 0xcbf29ce4 | 0;
  let lo = 0x84222325 | 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i) & 0xff;
    lo = (lo ^ c) >>> 0;
    // Multiply by 0x100000001B3 = 0x100 * 2^32 + 0x000001B3
    const aLo = lo;
    const aHi = hi;
    const bLo = 0x000001b3;
    const bHi = 0x00000100;
    // 64-bit multiply via BigInt for correctness (only at character cadence).
    const product = (BigInt(aHi) * 0x100000000n + BigInt(aLo)) * (BigInt(bHi) * 0x100000000n + BigInt(bLo));
    const masked = product & 0xffffffffffffffffn;
    lo = Number(masked & 0xffffffffn);
    hi = Number((masked >> 32n) & 0xffffffffn);
  }
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

/** Tokenize text into lowercase shingle words. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/** SimHash 64-bit from text. Tokens default to whitespace-split lowercase words. */
export function simhash64(text: string, tokens?: readonly string[]): bigint {
  const toks = tokens ?? tokenize(text);
  const v = new Array<number>(64).fill(0);
  for (const t of toks) {
    const { hi, lo } = fnv64(t);
    for (let b = 0; b < 32; b += 1) {
      v[b]! += (lo & (1 << b)) !== 0 ? 1 : -1;
      v[b + 32]! += (hi & (1 << b)) !== 0 ? 1 : -1;
    }
  }
  let result = 0n;
  for (let b = 0; b < 64; b += 1) {
    if (v[b]! > 0) result |= 1n << BigInt(b);
  }
  return result;
}

/** Hamming distance between two 64-bit simhashes. */
export function simhashHamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    x &= x - 1n;
    count += 1;
  }
  return count;
}
