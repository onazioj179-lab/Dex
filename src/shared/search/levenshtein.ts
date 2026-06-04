// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Levenshtein edit distance + similarity (typo-tolerant search, "did you mean").
 * Classic DP with a single rolling row. Pure: no DOM, no IO.
 */

/** Edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Normalized similarity 0..1 (1 = identical), case-insensitive. */
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(x, y) / maxLen;
}

export interface MatchResult {
  value: string;
  distance: number;
  similarity: number;
}

/**
 * Closest candidate to `query` by edit distance. `maxDistance` (optional) filters
 * out matches that are too far. Returns null when nothing qualifies.
 */
export function closestMatch(query: string, candidates: readonly string[], maxDistance = Infinity): MatchResult | null {
  let best: MatchResult | null = null;
  const q = query.toLowerCase();
  for (const c of candidates) {
    const distance = levenshtein(q, c.toLowerCase());
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) {
      best = { value: c, distance, similarity: 1 - distance / Math.max(q.length, c.length, 1) };
      if (distance === 0) break;
    }
  }
  return best;
}
