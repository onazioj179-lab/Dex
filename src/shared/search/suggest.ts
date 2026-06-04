// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Autocomplete suggestions (Spotlight type-ahead, command box, tag input).
 * Ranks candidates for a prefix: exact-prefix matches first (shorter first),
 * then substring matches, dropping non-matches. Case-insensitive. Pure: no DOM.
 */

export interface SuggestOptions {
  limit?: number;
  /** Include substring (not just prefix) matches. Default true. */
  substring?: boolean;
}

/** Rank `candidates` as completions of `prefix`. */
export function suggestCompletions(prefix: string, candidates: readonly string[], opts: SuggestOptions = {}): string[] {
  const limit = opts.limit ?? 8;
  const allowSub = opts.substring ?? true;
  const p = prefix.trim().toLowerCase();
  if (p === '') return candidates.slice(0, limit);

  const prefixHits: string[] = [];
  const subHits: string[] = [];
  for (const c of candidates) {
    const lc = c.toLowerCase();
    if (lc.startsWith(p)) prefixHits.push(c);
    else if (allowSub && lc.includes(p)) subHits.push(c);
  }

  // Prefix hits: shorter first (closer match), then alphabetical.
  prefixHits.sort((a, b) => a.length - b.length || a.localeCompare(b));
  subHits.sort((a, b) => a.localeCompare(b));

  return [...prefixHits, ...subHits].slice(0, limit);
}

/** The single best completion of `prefix`, or null. */
export function bestCompletion(prefix: string, candidates: readonly string[]): string | null {
  return suggestCompletions(prefix, candidates, { limit: 1 })[0] ?? null;
}
