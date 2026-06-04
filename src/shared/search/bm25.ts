// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * BM25 ranking (search quality). Scores a document against query terms using
 * Okapi BM25 with IDF, term saturation (k1) and length normalization (b). Pairs
 * with `tokenize.ts`/`termFrequencies`. Pure: no DOM, no IO.
 */

export interface CorpusStats {
  /** Total number of documents. */
  totalDocs: number;
  /** Average document length (in tokens). */
  avgDocLength: number;
  /** Document frequency per term: how many docs contain the term. */
  docFreq: Map<string, number>;
}

export interface Bm25Options {
  /** Term-frequency saturation. Default 1.5. */
  k1?: number;
  /** Length normalization 0..1. Default 0.75. */
  b?: number;
}

/** Robertson/Spärck-Jones IDF with the BM25 "+1" smoothing (always ≥ 0). */
export function idf(term: string, stats: CorpusStats): number {
  const df = stats.docFreq.get(term) ?? 0;
  const n = stats.totalDocs;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/**
 * BM25 score of a document for the query terms.
 * @param queryTerms tokenized query terms
 * @param termFreq   the document's term frequencies (from `termFrequencies`)
 * @param docLength  the document's token length
 */
export function bm25Score(
  queryTerms: readonly string[],
  termFreq: Map<string, number>,
  docLength: number,
  stats: CorpusStats,
  opts: Bm25Options = {},
): number {
  const k1 = opts.k1 ?? 1.5;
  const b = opts.b ?? 0.75;
  const avg = stats.avgDocLength > 0 ? stats.avgDocLength : 1;

  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreq.get(term) ?? 0;
    if (tf === 0) continue;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLength / avg));
    score += idf(term, stats) * (numerator / denominator);
  }
  return score;
}

/** Rank documents (with precomputed tf/length) by BM25, highest first. */
export function rankByBm25<T extends { termFreq: Map<string, number>; length: number }>(
  queryTerms: readonly string[],
  docs: readonly T[],
  stats: CorpusStats,
  opts?: Bm25Options,
): Array<{ doc: T; score: number }> {
  return docs
    .map((doc) => ({ doc, score: bm25Score(queryTerms, doc.termFreq, doc.length, stats, opts) }))
    .sort((a, b) => b.score - a.score);
}
