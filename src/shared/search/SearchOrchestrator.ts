// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unified Search Orchestrator. Single facade in front of every search
 * surface in DEX (Spotlight, command palette, settings search, file
 * search, UKI semantic search, command suggestions, etc.).
 *
 * Existing implementations register themselves as `SearchProvider`s.
 * Callers issue a `SearchQuery`; the orchestrator routes to providers,
 * applies their `accept` filter, blends and ranks the results, and emits
 * a single `SearchResultSet`.
 *
 * Implements Phase 1 of the Master Evolution Plan (search consolidation).
 * Existing surfaces continue to function; this layer is additive and
 * surfaces incrementally adopt it.
 */

export type SearchIntent =
  | 'general'
  | 'apps'
  | 'files'
  | 'commands'
  | 'settings'
  | 'memory'
  | 'web'
  | 'calculator';

export type SearchKind =
  | 'app'
  | 'file'
  | 'folder'
  | 'command'
  | 'setting'
  | 'note'
  | 'task'
  | 'memory'
  | 'calculator'
  | 'unit'
  | 'web'
  | 'asset'
  | 'action';

export interface SearchQuery {
  /** Raw user query. */
  text: string;
  /** Optional intent hint. Providers may override. */
  intent?: SearchIntent;
  /** Optional kinds filter; providers ignored when their kinds disjoint. */
  kinds?: readonly SearchKind[];
  /** Maximum results requested per provider. Defaults to 10. */
  limit?: number;
  /** Optional correlation ID for tracing. */
  correlationId?: string;
  /** Abort signal cooperatively respected by providers. */
  signal?: AbortSignal;
}

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  kind: SearchKind;
  /** Provider id that produced this result. */
  source: string;
  /** Provider-local raw score (any scale). */
  rawScore: number;
  /** Normalized 0..1 score after blending. Set by the orchestrator. */
  score: number;
  /** Optional payload for the action handler. */
  payload?: unknown;
  /** Optional iconHint or thumbnail key. */
  iconHint?: string;
  /** When the source produced this result. */
  producedAt: number;
}

export interface SearchResultSet {
  query: SearchQuery;
  results: SearchResult[];
  /** Per-provider duration in ms. Useful for the explainable-ranking panel. */
  timings: { provider: string; ms: number; count: number }[];
  /** True when at least one provider was aborted by the signal. */
  aborted: boolean;
}

export interface SearchProvider {
  /** Stable provider id. Lowercase. */
  readonly id: string;
  /** Kinds this provider can produce. */
  readonly kinds: readonly SearchKind[];
  /** Default weight applied to this provider's normalized scores. 1.0 = neutral. */
  readonly weight?: number;
  /**
   * Returns true when this provider should run for `query`. Defaults to
   * true unless the query explicitly limits kinds and the intersection is
   * empty.
   */
  accept?(query: SearchQuery): boolean;
  /**
   * Run the search. Must respect `query.signal` and return promptly when
   * aborted.
   */
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export interface SearchOrchestratorOptions {
  /** Soft per-provider timeout in ms. Default 250. */
  providerTimeoutMs?: number;
  /** Maximum total results returned across providers. Default 50. */
  maxResults?: number;
}

interface ProviderEntry {
  provider: SearchProvider;
}

export class SearchOrchestrator {
  private providers = new Map<string, ProviderEntry>();
  private providerTimeoutMs: number;
  private maxResults: number;

  constructor(options: SearchOrchestratorOptions = {}) {
    this.providerTimeoutMs = Math.max(10, options.providerTimeoutMs ?? 250);
    this.maxResults = Math.max(1, options.maxResults ?? 50);
  }

  register(provider: SearchProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new Error(`SearchProvider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, { provider });
    return () => { this.providers.delete(provider.id); };
  }

  unregister(id: string): void { this.providers.delete(id); }

  list(): readonly SearchProvider[] {
    return Array.from(this.providers.values()).map((e) => e.provider);
  }

  has(id: string): boolean { return this.providers.has(id); }

  size(): number { return this.providers.size; }

  async search(query: SearchQuery, now: () => number = Date.now): Promise<SearchResultSet> {
    const text = query.text.trim();
    if (text.length === 0) {
      return { query, results: [], timings: [], aborted: false };
    }
    const candidates = this.candidateProviders(query);
    const timings: SearchResultSet['timings'] = [];
    const collected: SearchResult[] = [];
    let aborted = false;

    const work = candidates.map(async (provider) => {
      const started = now();
      try {
        const results = await this.runProvider(provider, query);
        const ms = now() - started;
        timings.push({ provider: provider.id, ms, count: results.length });
        for (const r of results) collected.push(r);
      } catch (err) {
        const ms = now() - started;
        timings.push({ provider: provider.id, ms, count: 0 });
        if ((err as { name?: string }).name === 'AbortError') {
          aborted = true;
        }
      }
    });
    await Promise.all(work);

    if (query.signal?.aborted) aborted = true;

    const blended = this.blend(collected);
    return {
      query,
      results: blended.slice(0, this.maxResults),
      timings,
      aborted,
    };
  }

  private candidateProviders(query: SearchQuery): SearchProvider[] {
    const wantedKinds = query.kinds ? new Set(query.kinds) : null;
    const out: SearchProvider[] = [];
    for (const { provider } of this.providers.values()) {
      if (provider.accept && !provider.accept(query)) continue;
      if (wantedKinds) {
        const hasOverlap = provider.kinds.some((k) => wantedKinds.has(k));
        if (!hasOverlap) continue;
      }
      out.push(provider);
    }
    return out;
  }

  private async runProvider(provider: SearchProvider, query: SearchQuery): Promise<SearchResult[]> {
    const timeoutMs = this.providerTimeoutMs;
    const inner = provider.search(query);
    if (timeoutMs <= 0) return inner;
    return await new Promise<SearchResult[]>((resolve, reject) => {
      const handle = setTimeout(() => {
        const err = new Error(`SearchProvider timeout: ${provider.id}`);
        err.name = 'TimeoutError';
        reject(err);
      }, timeoutMs);
      inner.then(
        (value) => { clearTimeout(handle); resolve(value); },
        (err) => { clearTimeout(handle); reject(err); },
      );
    });
  }

  private blend(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) return [];
    const byProvider = new Map<string, number>();
    for (const r of results) {
      byProvider.set(r.source, Math.max(byProvider.get(r.source) ?? 0, r.rawScore));
    }
    for (const r of results) {
      const denom = byProvider.get(r.source) || 1;
      const normalized = denom === 0 ? 0 : Math.max(0, Math.min(1, r.rawScore / denom));
      const weight = this.providers.get(r.source)?.provider.weight ?? 1;
      r.score = normalized * weight;
    }
    results.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];
    for (const r of results) {
      const key = `${r.kind}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    return deduped;
  }
}
