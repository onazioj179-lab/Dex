// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexCode -- fuzzy file matching for Quick Open (Ctrl/Cmd+P).
//
// A pure, dependency-free subsequence matcher: a query matches a candidate when
// every query character appears in order somewhere in the candidate. The score
// rewards contiguous runs, matches at word/path boundaries, and matches against
// the file's base name over its full path, so typing "main" surfaces "main.dex"
// ahead of "src/maintenance/util.dex". Pure (no DOM/IPC) so it is trivially
// testable and reusable by the Quick Open palette.

export interface QuickOpenItem {
  name: string;
  path: string;
}

export interface QuickOpenResult<T extends QuickOpenItem> {
  item: T;
  score: number;
  /** Indices into the item's `name` that matched, for highlight rendering. */
  matches: number[];
}

const BOUNDARY = /[\\/._\- ]/;

/**
 * Score a single candidate string against a lower-cased query. Returns the score
 * plus the matched character indices, or null when the query is not a
 * subsequence of the candidate.
 *
 * Scoring favours: matches at the very start, matches right after a path/word
 * boundary, and contiguous runs -- mirroring how editors rank quick-open hits.
 */
export function fuzzyScore(candidate: string, queryLower: string): { score: number; matches: number[] } | null {
  if (!queryLower) return { score: 0, matches: [] };
  const cand = candidate.toLowerCase();
  const matches: number[] = [];
  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  for (let ci = 0; ci < cand.length && qi < queryLower.length; ci++) {
    if (cand[ci] !== queryLower[qi]) continue;
    matches.push(ci);
    let bonus = 1;
    if (ci === 0) bonus += 8;                                   // start of string
    else if (BOUNDARY.test(candidate[ci - 1])) bonus += 6;       // after a separator
    if (ci === prevMatch + 1) bonus += 5;                        // contiguous run
    score += bonus;
    prevMatch = ci;
    qi++;
  }
  if (qi < queryLower.length) return null; // not all query chars consumed
  // Shorter candidates that are otherwise equal rank a touch higher.
  score -= cand.length * 0.05;
  return { score, matches };
}

/**
 * Rank items by how well the query matches their base name (preferred) or full
 * path (fallback). Items that match neither are dropped. Stable, highest score
 * first; ties keep the input order. Bounded by `limit`.
 */
export function fuzzyFilter<T extends QuickOpenItem>(items: T[], query: string, limit = 50): QuickOpenResult<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // Empty query -> first `limit` items, unscored, in their natural order.
    return items.slice(0, limit).map(item => ({ item, score: 0, matches: [] }));
  }
  const scored: QuickOpenResult<T>[] = [];
  for (const item of items) {
    const byName = fuzzyScore(item.name, q);
    if (byName) {
      // Matching the base name is the common, intended case -- weight it up.
      scored.push({ item, score: byName.score + 20, matches: byName.matches });
      continue;
    }
    const byPath = fuzzyScore(item.path, q);
    if (byPath) {
      // Project the path matches that fall inside the trailing base name back
      // onto `name` indices so highlighting still lines up; drop the rest.
      const offset = item.path.length - item.name.length;
      const nameMatches = byPath.matches.filter(i => i >= offset).map(i => i - offset);
      scored.push({ item, score: byPath.score, matches: nameMatches });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
