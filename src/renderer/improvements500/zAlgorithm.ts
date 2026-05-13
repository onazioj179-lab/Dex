// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Z-Algorithm: for a string s of length n, computes the Z-array where
 * Z[i] is the length of the longest substring starting at i that
 * matches a prefix of s. O(n) time and space.
 */

export function zArray(s: string): Int32Array {
  const n = s.length;
  const z = new Int32Array(n);
  if (n === 0) return z;
  z[0] = n;
  let l = 0;
  let r = 0;
  for (let i = 1; i < n; i += 1) {
    if (i < r) z[i] = Math.min(r - i, z[i - l]!);
    while (i + z[i]! < n && s[z[i]!] === s[i + z[i]!]) z[i] = z[i]! + 1;
    if (i + z[i]! > r) {
      l = i;
      r = i + z[i]!;
    }
  }
  return z;
}

/**
 * Find all occurrences of `pattern` in `text` using Z-algorithm.
 */
export function zSearch(text: string, pattern: string): number[] {
  if (pattern.length === 0) return [];
  const sep = '\x00';
  const combined = pattern + sep + text;
  const z = zArray(combined);
  const out: number[] = [];
  const pLen = pattern.length;
  for (let i = pLen + 1; i < combined.length; i += 1) {
    if (z[i]! >= pLen) out.push(i - pLen - 1);
  }
  return out;
}
