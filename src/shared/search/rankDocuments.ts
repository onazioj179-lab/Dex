// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Document ranking pipeline (notes/files content search). Composes the search
 * primitives — `tokenize` → corpus stats → `bm25` relevance → optional recency
 * blend (`scoreCombine`) — into a ready-to-use ranker. The integration layer
 * that turns the search toolkit into a usable engine. Pure: no DOM, no IO.
 */

import { tokenize, termFrequencies } from './tokenize';
import { bm25Score, type CorpusStats } from './bm25';
import { recencyBoost } from './scoreCombine';

export interface RankDoc {
  id: string;
  text: string;
  /** Optional last-modified epoch ms, for a recency blend. */
  ts?: number;
}

export interface RankedDoc {
  id: string;
  score: number;
}

export interface RankOptions {
  /** Half-life (ms) for the recency blend; omit to disable. */
  recencyHalfLifeMs?: number;
  /** "Now" for recency (default Date.now()). */
  now?: number;
  limit?: number;
}

/** Rank documents against a query by BM25, optionally blended with recency. */
export function rankDocuments(query: string, docs: readonly RankDoc[], opts: RankOptions = {}): RankedDoc[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || docs.length === 0) return [];

  // Build corpus statistics in one pass.
  const docFreq = new Map<string, number>();
  let totalLength = 0;
  const prepared = docs.map((d) => {
    const tf = termFrequencies(d.text);
    const length = Array.from(tf.values()).reduce((a, b) => a + b, 0);
    totalLength += length;
    for (const term of tf.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    return { doc: d, tf, length };
  });

  const stats: CorpusStats = {
    totalDocs: docs.length,
    avgDocLength: totalLength / docs.length,
    docFreq,
  };

  // Raw BM25 scores, then normalize to 0..1 for the recency blend.
  const raw = prepared.map((p) => ({
    doc: p.doc,
    bm25: bm25Score(queryTerms, p.tf, p.length, stats),
  }));
  const maxScore = Math.max(0, ...raw.map((r) => r.bm25));

  const now = opts.now ?? Date.now();
  const ranked: RankedDoc[] = raw
    .filter((r) => r.bm25 > 0)
    .map((r) => {
      const norm = maxScore > 0 ? r.bm25 / maxScore : 0;
      const score = opts.recencyHalfLifeMs && r.doc.ts !== undefined
        ? recencyBoost(norm, now - r.doc.ts, opts.recencyHalfLifeMs)
        : norm;
      return { id: r.doc.id, score };
    })
    .sort((a, b) => b.score - a.score);

  return opts.limit ? ranked.slice(0, opts.limit) : ranked;
}
