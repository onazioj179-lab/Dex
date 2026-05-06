// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UKI Rewind Memory Bridge
// Single recall surface that fuses three memory tiers:
//   1. UkiKnowledgeGraph   (semantic / structural)
//   2. Rust native UKI memory archive (durable summaries)
//   3. RewindEngine timeline (clipboard / files / browser / app activity)
// ===========================================================================

export interface RecallSource {
  source: 'knowledge' | 'native' | 'rewind';
  id: string;
  label: string;
  summary: string;
  /** Unix ms or 0 if unknown. */
  timestamp: number;
  /** Source-specific weight pre-blend (0..1+). */
  rawScore: number;
  /** Final blended score (0..1). */
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RecallResult {
  query: string;
  results: RecallSource[];
  /** Concise natural-language synthesis suitable for an assistant reply. */
  synthesis: string;
}

export interface RecallOptions {
  /** Max number of merged results returned. Default 12. */
  limit?: number;
  /** Days of Rewind history to scan. Default 7. */
  rewindDaysBack?: number;
  /** Per-source caps before merge. Default 8. */
  perSourceLimit?: number;
  /** Half-life in milliseconds for recency decay. Default 7 days. */
  recencyHalfLifeMs?: number;
}

// ---------------------------------------------------------------------------
// Provider contracts (each is optional so the bridge can run partial)
// ---------------------------------------------------------------------------

export interface KnowledgeProvider {
  search(query: string, limit: number): RecallSource[];
}

export interface NativeMemoryProvider {
  search(query: string, limit: number): RecallSource[];
}

export interface RewindProvider {
  search(query: string, daysBack: number): RecallSource[];
}

export interface UkiRewindMemoryDeps {
  knowledge?: KnowledgeProvider | null;
  native?: NativeMemoryProvider | null;
  rewind?: RewindProvider | null;
  /** Override for `Date.now()` in tests. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

export class UkiRewindMemory {
  private knowledge: KnowledgeProvider | null;
  private native: NativeMemoryProvider | null;
  private rewind: RewindProvider | null;
  private now: () => number;

  constructor(deps: UkiRewindMemoryDeps = {}) {
    this.knowledge = deps.knowledge ?? null;
    this.native = deps.native ?? null;
    this.rewind = deps.rewind ?? null;
    this.now = deps.now ?? Date.now;
  }

  /** True if any provider is wired in. */
  get isAvailable(): boolean {
    return Boolean(this.knowledge || this.native || this.rewind);
  }

  /**
   * Recall context for a free-text query. Merges all providers, dedupes by
   * (source,id), reranks by score = 0.6 * similarity + 0.4 * recency.
   */
  recallContext(query: string, options: RecallOptions = {}): RecallResult {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return { query: trimmed, results: [], synthesis: '' };
    }

    const limit = options.limit ?? 12;
    const perSourceLimit = options.perSourceLimit ?? 8;
    const halfLife = options.recencyHalfLifeMs ?? 7 * 24 * 60 * 60 * 1000;
    const daysBack = options.rewindDaysBack ?? 7;
    const now = this.now();

    const buckets: RecallSource[] = [];

    if (this.knowledge) {
      buckets.push(...this.safeCall(() => this.knowledge!.search(trimmed, perSourceLimit)));
    }
    if (this.native) {
      buckets.push(...this.safeCall(() => this.native!.search(trimmed, perSourceLimit)));
    }
    if (this.rewind) {
      buckets.push(...this.safeCall(() => this.rewind!.search(trimmed, daysBack)));
    }

    const deduped = this.dedupe(buckets);
    const ranked = deduped
      .map(r => ({
        ...r,
        score: this.blendScore(r.rawScore, r.timestamp, now, halfLife),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      query: trimmed,
      results: ranked,
      synthesis: this.synthesize(trimmed, ranked),
    };
  }

  // ---- Internals ----------------------------------------------------------

  private safeCall(fn: () => RecallSource[]): RecallSource[] {
    try {
      const out = fn();
      return Array.isArray(out) ? out : [];
    } catch {
      return [];
    }
  }

  private dedupe(rows: RecallSource[]): RecallSource[] {
    const seen = new Map<string, RecallSource>();
    for (const r of rows) {
      const key = `${r.source}::${r.id}`;
      const existing = seen.get(key);
      if (!existing || r.rawScore > existing.rawScore) {
        seen.set(key, r);
      }
    }
    return [...seen.values()];
  }

  private blendScore(raw: number, ts: number, now: number, halfLife: number): number {
    const sim = clamp01(raw);
    if (!ts || ts <= 0) return Math.min(1, 0.6 * sim);
    const ageMs = Math.max(0, now - ts);
    const recency = Math.pow(0.5, ageMs / halfLife); // 1.0 -> 0.5 over halfLife
    return clamp01(0.6 * sim + 0.4 * recency);
  }

  private synthesize(query: string, results: RecallSource[]): string {
    if (results.length === 0) {
      return `No relevant memory for "${query}".`;
    }
    const top = results.slice(0, 3).map(r => `- [${r.source}] ${r.label}: ${truncate(r.summary, 140)}`);
    return `Recall for "${query}":\n${top.join('\n')}`;
  }
}

// ---------------------------------------------------------------------------
// Adapters that turn the existing DEX subsystems into RecallSource streams.
// Each adapter is created lazily so this module stays test-friendly.
// ---------------------------------------------------------------------------

export function makeKnowledgeAdapter(graph: {
  getNodes(): Array<{ id: string; label: string; weight: number; lastUsed: number; type: string }>;
}): KnowledgeProvider {
  return {
    search(query, limit) {
      const q = query.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      const nodes = graph.getNodes();
      const scored: RecallSource[] = [];
      for (const n of nodes) {
        const hay = `${n.label} ${n.id} ${n.type}`.toLowerCase();
        let hits = 0;
        for (const t of tokens) if (hay.includes(t)) hits++;
        if (hits === 0) continue;
        const sim = hits / tokens.length;
        scored.push({
          source: 'knowledge',
          id: n.id,
          label: n.label,
          summary: `${n.type} node (weight ${n.weight})`,
          timestamp: n.lastUsed || 0,
          rawScore: sim,
          score: sim,
          metadata: { type: n.type, weight: n.weight },
        });
      }
      return scored.sort((a, b) => b.rawScore - a.rawScore).slice(0, limit);
    },
  };
}

export function makeNativeMemoryAdapter(native: {
  ukiMemorySearch(query: string, limit: number): string;
}): NativeMemoryProvider {
  return {
    search(query, limit) {
      let raw: string;
      try { raw = native.ukiMemorySearch(query, limit); } catch { return []; }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return []; }
      if (!Array.isArray(parsed)) return [];
      const out: RecallSource[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const summary = typeof rec.summary === 'string' ? rec.summary : '';
        if (!summary) continue;
        const id = String(rec.id ?? rec.recordId ?? rec.timestamp ?? `n-${out.length}`);
        const ts = typeof rec.timestamp === 'number' ? rec.timestamp
          : typeof rec.created === 'number' ? rec.created : 0;
        const score = typeof rec.score === 'number' ? rec.score : 0.6;
        const label = typeof rec.action === 'string' ? rec.action
          : typeof rec.type === 'string' ? rec.type : 'memory';
        out.push({
          source: 'native',
          id,
          label,
          summary,
          timestamp: ts,
          rawScore: clamp01(score),
          score: 0,
          metadata: rec,
        });
      }
      return out;
    },
  };
}

export function makeRewindAdapter(engine: {
  search(query: string, daysBack?: number): Array<{ id: string; type: string; content: string; appName: string; timestamp: number; metadata: Record<string, unknown> }>;
}): RewindProvider {
  return {
    search(query, daysBack) {
      let entries: ReturnType<typeof engine.search>;
      try { entries = engine.search(query, daysBack); } catch { return []; }
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      return entries.map(e => {
        const hay = `${e.content} ${e.appName}`.toLowerCase();
        let hits = 0;
        for (const t of tokens) if (hay.includes(t)) hits++;
        const sim = tokens.length === 0 ? 0.5 : hits / tokens.length;
        return {
          source: 'rewind' as const,
          id: e.id,
          label: `${e.appName} (${e.type})`,
          summary: e.content.slice(0, 240),
          timestamp: e.timestamp,
          rawScore: clamp01(sim),
          score: 0,
          metadata: e.metadata,
        };
      });
    },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// Lazy singleton wired into the live DEX subsystems. Renderer/main IPC
// handlers should call `getUkiRewindMemory()` rather than constructing
// directly so the underlying providers can be swapped at runtime.
// ---------------------------------------------------------------------------

let _instance: UkiRewindMemory | null = null;

export function getUkiRewindMemory(): UkiRewindMemory {
  if (_instance) return _instance;
  _instance = new UkiRewindMemory();
  return _instance;
}

export function configureUkiRewindMemory(deps: UkiRewindMemoryDeps): UkiRewindMemory {
  _instance = new UkiRewindMemory(deps);
  return _instance;
}

/** Reset for tests. */
export function resetUkiRewindMemory(): void {
  _instance = null;
}
