// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rabin-Karp rolling-hash substring search. Useful for multi-pattern
 * search of equal-length needles or as a fast preliminary filter.
 */

const BASE = 257;
const MOD = 1_000_000_007;

function modpow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if ((e & 1) === 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>>= 1;
  }
  return result;
}

/** First index of `pattern` in `text`, or -1. Linear expected, quadratic worst. */
export function rabinKarpSearch(text: string, pattern: string): number {
  const n = text.length;
  const m = pattern.length;
  if (m === 0) return 0;
  if (m > n) return -1;
  const high = modpow(BASE, m - 1, MOD);
  let pHash = 0;
  let tHash = 0;
  for (let i = 0; i < m; i += 1) {
    pHash = (pHash * BASE + pattern.charCodeAt(i)) % MOD;
    tHash = (tHash * BASE + text.charCodeAt(i)) % MOD;
  }
  for (let i = 0; i <= n - m; i += 1) {
    if (pHash === tHash) {
      let match = true;
      for (let j = 0; j < m; j += 1) {
        if (text.charCodeAt(i + j) !== pattern.charCodeAt(j)) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    if (i < n - m) {
      tHash = (tHash - text.charCodeAt(i) * high) % MOD;
      tHash = (tHash * BASE + text.charCodeAt(i + m)) % MOD;
      if (tHash < 0) tHash += MOD;
    }
  }
  return -1;
}

/** All non-overlapping matches of `pattern` in `text`. */
export function rabinKarpAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  if (pattern.length === 0) return out;
  let i = 0;
  while (i <= text.length - pattern.length) {
    const idx = rabinKarpSearch(text.slice(i), pattern);
    if (idx < 0) break;
    out.push(i + idx);
    i = i + idx + pattern.length;
  }
  return out;
}
