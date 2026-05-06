// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Nexus Embeddings
 * -----------------------------------------------------------------------------
 * Local, model-free text embeddings for the Nexus knowledge graph. Nothing is
 * sent over the network; every vector is computed from token statistics on
 * the fly. The vector space is a fixed-size hashed bag-of-words ("hashing
 * trick") with optional bigrams; cosine similarity gives surprisingly useful
 * "find similar" results without bundling a 100MB model.
 *
 * INTENTIONAL FALLBACK: a real local LLM embedding (e.g. MiniLM) gives better
 * semantic recall. When such a model is bundled in a future release, the same
 * `embed()` signature should switch to it; downstream code already speaks
 * cosine on Float32Array vectors.
 */

// DEX v3.8.5 - Nexus local embeddings

export interface EmbedOptions {
  /** Vector size. Default 256 (cheap and decent for short labels). */
  dims?: number;
  /** Include bigrams as well as unigrams. Default true. */
  bigrams?: boolean;
  /** L2-normalise the resulting vector. Default true. */
  normalise?: boolean;
}

const DEFAULT_DIMS = 256;
const TOKEN_RE = /[a-z0-9]+/g;

/** Lowercase + tokenise into words. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text.toLowerCase().match(TOKEN_RE) || [];
}

/** Fast 32-bit FNV-1a hash. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Embed text to a Float32 vector. */
export function embed(text: string, opts: EmbedOptions = {}): Float32Array {
  const dims = Math.max(8, opts.dims ?? DEFAULT_DIMS);
  const includeBigrams = opts.bigrams ?? true;
  const v = new Float32Array(dims);
  const tokens = tokenize(text);
  if (tokens.length === 0) return v;
  for (let i = 0; i < tokens.length; i++) {
    const idx = fnv1a(tokens[i]) % dims;
    v[idx] += 1;
    if (includeBigrams && i + 1 < tokens.length) {
      const big = tokens[i] + ' ' + tokens[i + 1];
      const bidx = fnv1a(big) % dims;
      v[bidx] += 0.5;
    }
  }
  if (opts.normalise !== false) l2Normalise(v);
  return v;
}

function l2Normalise(v: Float32Array): void {
  let sq = 0;
  for (let i = 0; i < v.length; i++) sq += v[i] * v[i];
  if (sq === 0) return;
  const inv = 1 / Math.sqrt(sq);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
}

/** Cosine similarity. Assumes inputs share length and are L2-normalised. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('vector length mismatch');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export interface EmbeddedItem<T> {
  item: T;
  vector: Float32Array;
}

/** Wrap items with their embeddings (vectorised once, cached by caller). */
export function embedAll<T>(items: T[], textOf: (t: T) => string, opts?: EmbedOptions): EmbeddedItem<T>[] {
  return items.map((item) => ({ item, vector: embed(textOf(item), opts) }));
}

export interface SimilarHit<T> {
  item: T;
  score: number;
}

/** Top-k nearest neighbours by cosine similarity. */
export function findSimilar<T>(
  query: string | Float32Array,
  pool: EmbeddedItem<T>[],
  k = 5,
  opts?: EmbedOptions,
): SimilarHit<T>[] {
  if (pool.length === 0) return [];
  const qv = typeof query === 'string' ? embed(query, opts) : query;
  const out: SimilarHit<T>[] = [];
  for (const p of pool) {
    const score = cosineSimilarity(qv, p.vector);
    out.push({ item: p.item, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, Math.max(0, k));
}
