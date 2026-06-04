// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Text tokenization (search indexing). Lowercases, splits on non-alphanumerics,
 * drops very short tokens and stopwords, and can de-duplicate — the shared
 * pre-processing step for the inverted index and (eventually) native fts.rs.
 * Pure: no DOM, no IO.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'is', 'are', 'was', 'were', 'be', 'by', 'with', 'as', 'it', 'this', 'that',
]);

export interface TokenizeOptions {
  /** Drop common stopwords. Default true. */
  stopwords?: boolean;
  /** Minimum token length to keep. Default 2. */
  minLength?: number;
  /** De-duplicate tokens (set semantics). Default false. */
  unique?: boolean;
}

/** Tokenize text into normalized terms. */
export function tokenize(text: string, opts: TokenizeOptions = {}): string[] {
  const minLength = opts.minLength ?? 2;
  const dropStop = opts.stopwords ?? true;

  let tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= minLength && (!dropStop || !STOPWORDS.has(t)));

  if (opts.unique) {
    const seen = new Set<string>();
    tokens = tokens.filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  }
  return tokens;
}

/** Term frequency map for a document. */
export function termFrequencies(text: string, opts?: TokenizeOptions): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokenize(text, opts)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}
