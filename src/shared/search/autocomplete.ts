// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Autocomplete / type-ahead suggestions (Spotlight, command palette, search
 * boxes). Blends prefix, abbreviation and n-gram matching into one ranked
 * suggestion list. Integration layer composing `abbreviation` + `ngram`. Pure.
 */

import { abbreviationScore } from './abbreviation';
import { ngramSimilarity } from './ngram';

export interface Suggestion {
  value: string;
  score: number;
}

/** Best match strength of `query` against one `candidate` (0..1). */
export function suggestionScore(query: string, candidate: string): number {
  const q = query.trim().toLowerCase();
  if (q === '') return 0;
  const c = candidate.toLowerCase();
  if (c === q) return 1;
  if (c.startsWith(q)) return 0.95;              // prefix is the strongest signal
  if (c.includes(q)) return 0.8;                 // substring
  const abbr = abbreviationScore(query, candidate); // initials / subsequence
  const fuzzy = ngramSimilarity(query, candidate) * 0.7;
  return Math.max(abbr * 0.85, fuzzy);
}

/**
 * Rank `candidates` as suggestions for `query`, best first, above `threshold`.
 * Empty query returns the first `limit` candidates unscored (recents/defaults).
 */
export function suggest(
  query: string,
  candidates: readonly string[],
  opts: { limit?: number; threshold?: number } = {},
): Suggestion[] {
  const limit = opts.limit ?? 8;
  const threshold = opts.threshold ?? 0.2;
  if (query.trim() === '') {
    return candidates.slice(0, limit).map((value) => ({ value, score: 0 }));
  }
  return candidates
    .map((value) => ({ value, score: suggestionScore(query, value) }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
