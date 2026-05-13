/*
 * DEX - Boyer-Moore-Horspool single-pattern search (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

/**
 * Returns first index of `pattern` in `text` at or after `start`, or -1.
 * Uses the bad-character heuristic from Boyer-Moore-Horspool.
 */
export function boyerMooreSearch(text: string, pattern: string, start = 0): number {
  const n = text.length;
  const m = pattern.length;
  if (m === 0) return Math.min(start, n);
  if (m > n - start) return -1;
  const skip = new Map<number, number>();
  for (let i = 0; i < m - 1; i += 1) {
    skip.set(pattern.charCodeAt(i), m - 1 - i);
  }
  let i = start;
  while (i <= n - m) {
    let j = m - 1;
    while (j >= 0 && pattern.charCodeAt(j) === text.charCodeAt(i + j)) j -= 1;
    if (j < 0) return i;
    i += skip.get(text.charCodeAt(i + m - 1)) ?? m;
  }
  return -1;
}

/** Returns all non-overlapping occurrences of `pattern` in `text`. */
export function boyerMooreAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  if (pattern.length === 0) return out;
  let i = 0;
  while (i <= text.length - pattern.length) {
    const idx = boyerMooreSearch(text, pattern, i);
    if (idx < 0) break;
    out.push(idx);
    i = idx + pattern.length;
  }
  return out;
}
