// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Ranked line search — the retrieval core for "find in code/text" (the first
 * step of letting UKI work over large files without loading everything into a
 * prompt). Pure + dependency-free so it is unit-testable and reusable: scan
 * lines, score by how many query terms hit (with a bonus for lines that contain
 * ALL terms), return the best matches. O(lines × terms) per query.
 */

export interface LineHit {
  /** 1-based line number. */
  line: number;
  /** Trimmed line text (capped). */
  text: string;
  /** Relevance score (higher = better). */
  score: number;
}

/** Split a query into lowercased word tokens (>= 2 chars). */
export function tokenize(query: string): string[] {
  return (query ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Rank lines of `text` against `query`. Returns up to `limit` hits, best first
 * (ties broken by earlier line number). Empty when the query has no usable
 * tokens or nothing matches.
 */
export function searchLines(text: string, query: string, limit = 20): LineHit[] {
  const terms = tokenize(query);
  if (!terms.length || !text) return [];

  const lines = text.split('\n');
  const hits: LineHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    let score = 0;
    let present = 0;
    for (const t of terms) {
      let idx = lower.indexOf(t);
      let count = 0;
      while (idx >= 0) {
        count++;
        idx = lower.indexOf(t, idx + t.length);
      }
      if (count > 0) {
        present++;
        score += count + 1; // each matched term: +1 base, +1 per occurrence
      }
    }
    if (present === 0) continue;
    // Strong bonus when a single line contains every query term.
    if (present === terms.length) score += terms.length * 2;
    hits.push({ line: i + 1, text: lines[i].trim().slice(0, 200), score });
  }

  hits.sort((a, b) => b.score - a.score || a.line - b.line);
  return hits.slice(0, limit);
}
