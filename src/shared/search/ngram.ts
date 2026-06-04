// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * N-gram similarity (fuzzy search ranking, typo tolerance, "did you mean").
 * Complements `levenshtein` with a cheap set-overlap measure that scales to many
 * candidates. Pure: no DOM, no IO.
 */

/** Lowercased n-grams of `str` (padded so short strings still produce grams). */
export function ngrams(str: string, n = 2): string[] {
  const s = `  ${str.toLowerCase().trim()} `.replace(/\s+/g, ' ');
  if (s.length < n) return [s];
  const out: string[] = [];
  for (let i = 0; i <= s.length - n; i++) out.push(s.slice(i, i + n));
  return out;
}

/** Jaccard similarity (0..1) over the n-gram sets of two strings. */
export function ngramSimilarity(a: string, b: string, n = 2): number {
  const setA = new Set(ngrams(a, n));
  const setB = new Set(ngrams(b, n));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const g of setA) if (setB.has(g)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface NgramMatch {
  value: string;
  score: number;
}

/** Rank candidates by n-gram similarity to `query`, best first, above `threshold`. */
export function ngramRank(query: string, candidates: readonly string[], threshold = 0, n = 2): NgramMatch[] {
  return candidates
    .map((value) => ({ value, score: ngramSimilarity(query, value, n) }))
    .filter((m) => m.score > threshold)
    .sort((a, b) => b.score - a.score);
}
