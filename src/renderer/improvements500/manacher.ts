// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Manacher's algorithm - longest palindromic substring in O(n).
 */

/** Returns [start, length] of the longest palindromic substring. */
export function longestPalindrome(text: string): { start: number; length: number } {
  if (text.length === 0) return { start: 0, length: 0 };
  // Transform "abc" -> "^#a#b#c#$" so even and odd lengths share code.
  const t: string[] = ['^'];
  for (let i = 0; i < text.length; i += 1) {
    t.push('#', text[i]!);
  }
  t.push('#', '$');
  const n = t.length;
  const p = new Int32Array(n);
  let center = 0;
  let right = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const mirror = 2 * center - i;
    if (i < right) p[i] = Math.min(right - i, p[mirror]!);
    while (t[i + 1 + p[i]!] === t[i - 1 - p[i]!]) p[i] += 1;
    if (i + p[i]! > right) {
      center = i;
      right = i + p[i]!;
    }
  }
  let bestCenter = 0;
  let bestLen = 0;
  for (let i = 1; i < n - 1; i += 1) {
    if (p[i]! > bestLen) {
      bestLen = p[i]!;
      bestCenter = i;
    }
  }
  const start = (bestCenter - bestLen) >> 1;
  return { start, length: bestLen };
}
