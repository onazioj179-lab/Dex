// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Query synonym expansion (search recall). Maps common shorthands/aliases to
 * their canonical terms so "pic" also matches "image", "vid" matches "video",
 * "prefs" matches "settings". The unified search uses the expanded term set to
 * widen recall without changing rankers. Pure: no DOM, no IO.
 */

// Canonical term -> aliases. Lookup is built bidirectionally below.
const GROUPS: Record<string, string[]> = {
  image: ['pic', 'picture', 'photo', 'img'],
  video: ['vid', 'movie', 'clip', 'film'],
  audio: ['sound', 'music', 'track', 'song'],
  document: ['doc', 'file', 'paper'],
  settings: ['prefs', 'preferences', 'config', 'options'],
  delete: ['remove', 'trash', 'erase'],
  new: ['create', 'add'],
  search: ['find', 'lookup'],
};

// term -> set of related terms (incl. itself), built once.
const INDEX: Map<string, Set<string>> = (() => {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set([a]));
    m.get(a)!.add(b);
  };
  for (const [canon, aliases] of Object.entries(GROUPS)) {
    const all = [canon, ...aliases];
    for (const t of all) for (const u of all) add(t, u);
  }
  return m;
})();

/** Synonyms for a single lowercase term (includes the term itself). */
export function synonymsOf(term: string): string[] {
  const set = INDEX.get(term.toLowerCase());
  return set ? Array.from(set) : [term.toLowerCase()];
}

/**
 * Expand a query into a de-duplicated set of terms (originals + synonyms),
 * preserving original-term-first ordering for stable ranking.
 */
export function expandTerms(query: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  // Originals first.
  for (const t of terms) if (!seen.has(t)) { seen.add(t); out.push(t); }
  // Then synonyms.
  for (const t of terms) {
    for (const s of synonymsOf(t)) if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
