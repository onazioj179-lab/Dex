// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// EmbeddingService
//
// Produces text embeddings for the renderer over IPC. Two backends:
//   1. ONNX gte-small (preferred) — lazy-loaded via OnnxModelManager when
//      onnxruntime-node is installed and the model has been downloaded.
//   2. Feature-hashing fallback (always available, deterministic, ~128 dim,
//      pure JS) — character n-grams + token bag, sign-balanced, L2-normed.
//
// The fallback is honest: it captures lexical similarity well enough for
// near-duplicate detection and rough clustering, but it is NOT semantic.
// When the ONNX path is wired the API contract stays the same.
//
// Role (audit FINDING 9): this is the single VECTOR SOURCE for UKI search. Its
// vectors feed the cosine index primitive src/shared/uki/embeddings.ts, which
// is the semantic half of the one search facade
// src/renderer/uki/semanticSearch.ts (the lexical half being
// src/renderer/uki/index_search.ts). Renderer consumers reach these vectors via
// the `embedding:compute` / `embedding:compute-batch` IPC; do not stand up a
// second embedding backend — extend this service instead.
// =============================================================================

import { ipcMain } from 'electron';
import { createHash } from 'crypto';
import log from 'electron-log';

const DIM = 128;

/** Token regex — alphanumerics + underscore, lowercased. */
const TOKEN_RE = /[a-z0-9_]+/g;

function tokens(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []);
}

/** Char trigrams from a single token, padded with sentinels. */
function trigrams(token: string): string[] {
  const padded = `^${token}$`;
  const out: string[] = [];
  for (let i = 0; i < padded.length - 2; i++) out.push(padded.slice(i, i + 3));
  return out;
}

/**
 * Stable hash of a feature into [0, DIM) plus sign in {-1, +1}.
 * Sign-balanced feature hashing reduces collision bias.
 */
function featureBucket(feature: string): { bucket: number; sign: number } {
  const h = createHash('sha1').update(feature).digest();
  // First 4 bytes for the bucket; next byte for sign.
  const bucket = h.readUInt32BE(0) % DIM;
  const sign = (h.readUInt8(4) & 1) === 0 ? 1 : -1;
  return { bucket, sign };
}

/**
 * Feature-hashing embedding. Captures token presence + character n-grams.
 * Deterministic: same text → same vector. L2-normalized so cosine = dot.
 */
export function hashEmbed(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  if (!text) return vec;

  const toks = tokens(text);
  // Token bag — log(1+freq) to dampen high-frequency words.
  const tokenCounts = new Map<string, number>();
  for (const t of toks) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
  for (const [tok, count] of tokenCounts) {
    const { bucket, sign } = featureBucket(`tok:${tok}`);
    vec[bucket] += sign * Math.log(1 + count);
  }
  // Character trigrams — capture morphology, typos, partial matches.
  for (const tok of toks) {
    for (const tri of trigrams(tok)) {
      const { bucket, sign } = featureBucket(`tri:${tri}`);
      vec[bucket] += sign * 0.25;
    }
  }
  // L2 normalize so cosine similarity reduces to dot product.
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
}

// In-memory cache so repeated calls are free.
const cache = new Map<string, number[]>();
const CACHE_LIMIT = 1024;

function cachedEmbed(text: string): number[] {
  const cached = cache.get(text);
  if (cached) return cached;
  const v = hashEmbed(text);
  if (cache.size >= CACHE_LIMIT) {
    // Drop oldest (Map preserves insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(text, v);
  return v;
}

export interface EmbeddingResultDTO {
  vector: number[];
  dim: number;
  /** Identifies which backend produced this vector. */
  backend: 'hash-128' | 'onnx-gte-small';
}

export function embed(text: string): EmbeddingResultDTO {
  return {
    vector: cachedEmbed(text),
    dim: DIM,
    backend: 'hash-128',
  };
}

export function embedBatch(texts: string[]): EmbeddingResultDTO[] {
  return texts.map(embed);
}

let registered = false;

export function registerEmbeddingIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('embedding:compute', (_evt, text: unknown) => {
    if (typeof text !== 'string') return null;
    if (text.length > 8192) return null;
    return embed(text);
  });
  ipcMain.handle('embedding:compute-batch', (_evt, texts: unknown) => {
    if (!Array.isArray(texts)) return null;
    if (texts.length > 256) return null;
    if (!texts.every((t) => typeof t === 'string' && t.length <= 8192)) return null;
    return embedBatch(texts);
  });
  log.info('[EmbeddingService] IPC registered (backend=hash-128)');
}
