// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// UKI Semantic Search Facade
//
// Roadmap reference: docs/DEX_OS_PRODUCTION_ROADMAP.md §1 (UKI backend).
//
// SINGLE FACADE (audit FINDING 9): this is the ONE entry point UI components
// import for "find something across UKI memory". UI must not call the
// `index_search.ts` lexical store directly — go through `semanticSearch()` so
// the backend can change underneath without touching callers.
//
// HYBRID CONTRACT — lexical and semantic are ONE system, not two parallel
// search stacks:
//   - lexical backend:  ./index_search.ts (inverted index over apps,
//     shortcuts, workflows, turns, and cold archive summaries). Always on in
//     the renderer; this is what we delegate to today (`source: 'lexical'`).
//   - semantic backend: vectors from the main-process EmbeddingService
//     (src/main/services/EmbeddingService.ts, hash-128 / onnx) stored in the
//     pure cosine index primitive src/shared/uki/embeddings.ts. Gated off via
//     getBackendStatus() until the phase 4.5 native uki_store + embedder ship.
// When `semantic`/`vector` flip on, this facade fans out to BOTH backends and
// merges by reciprocal rank into one ranked SemanticHit[] — the two indexes
// are complementary halves of a single hybrid retriever, never a duplicate.
// Callers do not change; the swap stays a single-file edit here.
//
// Keeping this layer thin and stable makes the eventual swap a single-file
// edit and gives tests one stable surface to assert on.
// =============================================================================

// Lexical half of the hybrid retriever (see HYBRID CONTRACT above). This is
// the only place `index_search` is consumed for "find"; the semantic half
// (shared/uki/embeddings + EmbeddingService) merges in here when enabled.
import { query as lexicalQuery, type UkiHit } from './index_search';

export type SearchMode = 'auto' | 'lexical' | 'semantic' | 'hybrid';

export interface SemanticSearchOptions {
  /** Caller hint. 'auto' picks the best available backend. */
  mode?: SearchMode;
  /** Maximum hits to return. Default 8. */
  limit?: number;
  /** Restrict to certain doc kinds. */
  kinds?: ReadonlyArray<UkiHit['doc']['kind']>;
  /** Minimum score threshold (post-normalisation, 0..1). Default 0. */
  minScore?: number;
}

export interface SemanticHit extends UkiHit {
  /** Backend that produced the hit. */
  source: 'lexical' | 'semantic' | 'hybrid';
  /** Score normalised to 0..1 across the result set. */
  normalizedScore: number;
}

export interface BackendStatus {
  lexical: boolean;
  semantic: boolean;
  vector: boolean;
}

/** Capability discovery. Future: probe native bridge for embeddings/HNSW. */
export function getBackendStatus(): BackendStatus {
  // Lexical is always available in renderer; semantic/vector require the
  // phase 4.5 native uki_store + tract embedder. Until then they are off.
  return {
    lexical: true,
    semantic: false,
    vector: false,
  };
}

function normalize(hits: UkiHit[]): SemanticHit[] {
  if (hits.length === 0) return [];
  const max = hits.reduce((m, h) => (h.score > m ? h.score : m), 0);
  const denom = max > 0 ? max : 1;
  return hits.map((h) => ({
    ...h,
    source: 'lexical' as const,
    normalizedScore: h.score / denom,
  }));
}

export async function semanticSearch(
  q: string,
  opts: SemanticSearchOptions = {},
): Promise<SemanticHit[]> {
  const limit = opts.limit ?? 8;
  const minScore = opts.minScore ?? 0;
  const kinds = opts.kinds;

  if (!q || q.trim().length === 0) return [];

  // Ask for more than we need so post-filters don't shrink the result set.
  const overscan = kinds && kinds.length > 0 ? limit * 3 : limit;
  const raw = await lexicalQuery(q, overscan);
  let normalized = normalize(raw);

  if (kinds && kinds.length > 0) {
    const kindSet = new Set(kinds);
    normalized = normalized.filter((h) => kindSet.has(h.doc.kind));
  }
  if (minScore > 0) {
    normalized = normalized.filter((h) => h.normalizedScore >= minScore);
  }
  return normalized.slice(0, limit);
}
