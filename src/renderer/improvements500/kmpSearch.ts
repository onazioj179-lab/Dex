// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Knuth-Morris-Pratt (KMP) substring search using prefix function.
 * Linear time in text + pattern length.
 */

function buildLps(pattern: string): Int32Array {
  const m = pattern.length;
  const lps = new Int32Array(m);
  let len = 0;
  let i = 1;
  while (i < m) {
    if (pattern.charCodeAt(i) === pattern.charCodeAt(len)) {
      len += 1;
      lps[i] = len;
      i += 1;
    } else if (len !== 0) {
      len = lps[len - 1]!;
    } else {
      lps[i] = 0;
      i += 1;
    }
  }
  return lps;
}

/** First index of `pattern` in `text` at or after `start`, or -1. */
export function kmpSearch(text: string, pattern: string, start = 0): number {
  if (pattern.length === 0) return Math.min(start, text.length);
  const lps = buildLps(pattern);
  let i = start;
  let j = 0;
  while (i < text.length) {
    if (text.charCodeAt(i) === pattern.charCodeAt(j)) {
      i += 1;
      j += 1;
      if (j === pattern.length) return i - j;
    } else if (j > 0) {
      j = lps[j - 1]!;
    } else {
      i += 1;
    }
  }
  return -1;
}

/** All non-overlapping occurrences of `pattern` in `text`. */
export function kmpAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  if (pattern.length === 0) return out;
  let i = 0;
  while (i <= text.length - pattern.length) {
    const idx = kmpSearch(text, pattern, i);
    if (idx < 0) break;
    out.push(idx);
    i = idx + pattern.length;
  }
  return out;
}
