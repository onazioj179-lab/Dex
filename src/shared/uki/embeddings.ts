// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pure cosine-similarity embedding index. In-memory, paged. The actual
 * embedding model lives elsewhere; this module only stores + searches
 * vectors that were already computed.
 */

// DEX v3.8.9 - UKI brain: embeddings

export interface EmbeddingEntry<P = unknown> {
  id: string;
  vector: number[];
  payload: P;
}

export interface EmbeddingIndex<P = unknown> {
  entries: EmbeddingEntry<P>[];
  dim: number;
}

export function createEmbeddingIndex<P = unknown>(dim: number): EmbeddingIndex<P> {
  if (dim <= 0 || !Number.isInteger(dim)) throw new Error('dim must be positive integer');
  return { entries: [], dim };
}

export function addEmbedding<P>(index: EmbeddingIndex<P>, entry: EmbeddingEntry<P>): EmbeddingIndex<P> {
  if (entry.vector.length !== index.dim) {
    throw new Error(`vector dim ${entry.vector.length} != index dim ${index.dim}`);
  }
  // Replace by id if exists.
  const existing = index.entries.findIndex((e) => e.id === entry.id);
  if (existing >= 0) {
    const next = [...index.entries];
    next[existing] = entry;
    return { ...index, entries: next };
  }
  return { ...index, entries: [...index.entries, entry] };
}

export function removeEmbedding<P>(index: EmbeddingIndex<P>, id: string): EmbeddingIndex<P> {
  return { ...index, entries: index.entries.filter((e) => e.id !== id) };
}

/** Cosine similarity in [-1, 1]. Returns 0 for zero vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('vector length mismatch');
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface EmbeddingHit<P> {
  entry: EmbeddingEntry<P>;
  score: number;
}

export interface SearchOptions {
  k?: number;
  /** Drop hits with score below this. Default -Infinity. */
  minScore?: number;
}

/**
 * Top-k cosine search. Linear scan — fine for thousands of entries; for
 * larger sets the renderer should switch to native sqlite-vec.
 */
export function searchEmbeddings<P>(
  index: EmbeddingIndex<P>,
  query: number[],
  opts: SearchOptions = {},
): EmbeddingHit<P>[] {
  if (query.length !== index.dim) throw new Error('query dim mismatch');
  const k = opts.k ?? 5;
  const minScore = opts.minScore ?? -Infinity;
  const hits: EmbeddingHit<P>[] = [];
  for (const e of index.entries) {
    const score = cosineSimilarity(query, e.vector);
    if (score >= minScore) hits.push({ entry: e, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

/** Total entries in the index. */
export function indexSize(index: EmbeddingIndex<unknown>): number { return index.entries.length; }
