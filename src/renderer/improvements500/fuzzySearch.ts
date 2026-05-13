// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Fuzzy substring scorer (T5 graph search, command palette upgrade).
 *
 * Returns a score in [0, 1] where 1 is an exact prefix match and 0 is no
 * match. Algorithm: subsequence match with bonuses for consecutive runs,
 * camel-case boundaries, and start-of-word matches.
 */

export interface FuzzyMatch<T> { item: T; score: number; matches: readonly number[]; }

export function fuzzyScore(query: string, target: string): { score: number; matches: number[] } {
  if (!query) return { score: 0, matches: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) {
    const matches: number[] = [];
    for (let i = 0; i < q.length; i++) matches.push(i);
    return { score: 1 - (target.length - q.length) * 0.001, matches };
  }
  let qi = 0;
  let score = 0;
  let prev = -2;
  const matches: number[] = [];
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      let bonus = 0.1;
      if (i === prev + 1) bonus += 0.3;          // consecutive
      if (i === 0 || /[\s_\-/.]/.test(t[i - 1])) bonus += 0.2; // word start
      if (target[i] >= 'A' && target[i] <= 'Z') bonus += 0.1;  // camel boundary
      score += bonus;
      matches.push(i);
      prev = i;
      qi++;
    }
  }
  if (qi < q.length) return { score: 0, matches: [] };
  return { score: Math.min(score / q.length, 0.99), matches };
}

export function fuzzyFilter<T>(items: readonly T[], query: string, getText: (t: T) => string, limit = 50): FuzzyMatch<T>[] {
  if (!query) return items.slice(0, limit).map((item) => ({ item, score: 1, matches: [] }));
  const out: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const { score, matches } = fuzzyScore(query, getText(item));
    if (score > 0) out.push({ item, score, matches });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
