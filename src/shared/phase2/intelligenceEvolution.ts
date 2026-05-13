// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 2 - UKI Intelligence Evolution shared primitives.
 *
 * Pure, dependency-free building blocks for fact provenance, retrieval
 * reranking, archive compaction, and memory health checks. Existing UKI
 * implementations migrate onto these surfaces incrementally.
 *
 * Implements the Phase 2 lane of the Master Evolution Plan. Distinct from
 * the older `src/shared/uki/intelligence.ts` (wave-L assistant polish);
 * this module focuses on memory-tier governance.
 */

export interface ProvenanceEntry {
  readonly factId: string;
  readonly source: string;
  readonly confidence: number;
  readonly recordedAt: number;
}

export class ProvenanceLedger {
  private readonly byFact = new Map<string, ProvenanceEntry[]>();

  record(factId: string, source: string, confidence: number, now: number = Date.now()): ProvenanceEntry {
    if (!factId) throw new Error('factId required');
    if (!source) throw new Error('source required');
    const c = clamp01(confidence);
    const entry: ProvenanceEntry = { factId, source, confidence: c, recordedAt: now };
    const list = this.byFact.get(factId) ?? [];
    list.unshift(entry);
    this.byFact.set(factId, list);
    return entry;
  }

  get(factId: string): readonly ProvenanceEntry[] {
    return this.byFact.get(factId) ?? [];
  }

  facts(): string[] {
    return Array.from(this.byFact.keys());
  }

  effectiveConfidence(factId: string, now: number, halfLifeMs: number): number {
    if (halfLifeMs <= 0) throw new Error('halfLifeMs must be > 0');
    const list = this.byFact.get(factId);
    if (!list || list.length === 0) return 0;
    const head = list[0]!;
    const dt = Math.max(0, now - head.recordedAt);
    return head.confidence * Math.pow(0.5, dt / halfLifeMs);
  }
}

export interface RetrievalCandidate {
  readonly id: string;
  readonly text: string;
  readonly baseScore: number;
  readonly factId?: string;
  readonly producedAt?: number;
}

export interface RerankContext {
  readonly query: string;
  readonly now: number;
  readonly recencyHalfLifeMs?: number;
  readonly provenance?: ProvenanceLedger;
  readonly weights?: { lexical?: number; recency?: number; provenance?: number };
}

export interface RerankResult extends RetrievalCandidate {
  readonly score: number;
  readonly components: { lexical: number; recency: number; provenance: number };
}

export function rerank(candidates: readonly RetrievalCandidate[], ctx: RerankContext): RerankResult[] {
  const w = {
    lexical: ctx.weights?.lexical ?? 1,
    recency: ctx.weights?.recency ?? 0.5,
    provenance: ctx.weights?.provenance ?? 0.5,
  };
  const halfLife = ctx.recencyHalfLifeMs ?? 24 * 60 * 60 * 1000;
  const tokens = tokenize(ctx.query);
  const lexicalScores = candidates.map((c) => lexicalOverlap(tokens, c.text) * c.baseScore);
  const lexicalMax = Math.max(1e-9, ...lexicalScores);
  const out: RerankResult[] = candidates.map((c, i) => {
    const lexical = lexicalScores[i]! / lexicalMax;
    const recency = c.producedAt != null
      ? Math.pow(0.5, Math.max(0, ctx.now - c.producedAt) / halfLife)
      : 0;
    const provenance = c.factId && ctx.provenance
      ? ctx.provenance.effectiveConfidence(c.factId, ctx.now, halfLife)
      : 0;
    const score = lexical * w.lexical + recency * w.recency + provenance * w.provenance;
    return { ...c, score, components: { lexical, recency, provenance } };
  });
  out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return out;
}

export interface ArchiveCandidate {
  readonly id: string;
  readonly producedAt: number;
  readonly bytes: number;
  readonly factId?: string;
}

export interface CompactionResult {
  readonly kept: ArchiveCandidate[];
  readonly archived: ArchiveCandidate[];
  readonly bytesKept: number;
  readonly bytesArchived: number;
}

export interface CompactionPolicy {
  readonly maxAgeMs?: number;
  readonly maxTotalBytes?: number;
  readonly now: number;
}

export function compactArchive(items: readonly ArchiveCandidate[], policy: CompactionPolicy): CompactionResult {
  let kept = items.slice();
  const archived: ArchiveCandidate[] = [];
  if (policy.maxAgeMs != null) {
    const cutoff = policy.now - policy.maxAgeMs;
    const next: ArchiveCandidate[] = [];
    for (const it of kept) {
      if (it.producedAt < cutoff) archived.push(it);
      else next.push(it);
    }
    kept = next;
  }
  if (policy.maxTotalBytes != null) {
    let total = kept.reduce((s, x) => s + x.bytes, 0);
    if (total > policy.maxTotalBytes) {
      const sorted = kept.slice().sort((a, b) => a.producedAt - b.producedAt || a.id.localeCompare(b.id));
      while (total > policy.maxTotalBytes && sorted.length > 0) {
        const evicted = sorted.shift()!;
        archived.push(evicted);
        total -= evicted.bytes;
      }
      const archivedIds = new Set(archived.map((a) => a.id));
      kept = kept.filter((x) => !archivedIds.has(x.id));
    }
  }
  return {
    kept,
    archived,
    bytesKept: kept.reduce((s, x) => s + x.bytes, 0),
    bytesArchived: archived.reduce((s, x) => s + x.bytes, 0),
  };
}

export interface MemoryHealthIssue {
  readonly code: 'duplicate-fact' | 'low-confidence' | 'stale' | 'orphan-archive';
  readonly factId?: string;
  readonly detail: string;
}

export interface MemoryHealthReport {
  readonly issues: MemoryHealthIssue[];
  readonly score: number;
}

export interface MemoryHealthInput {
  readonly provenance: ProvenanceLedger;
  readonly archive: readonly ArchiveCandidate[];
  readonly now: number;
  readonly staleMs?: number;
  readonly minConfidence?: number;
}

export function memoryHealth(input: MemoryHealthInput): MemoryHealthReport {
  const issues: MemoryHealthIssue[] = [];
  const stale = input.staleMs ?? 30 * 24 * 60 * 60 * 1000;
  const minConf = input.minConfidence ?? 0.2;
  const facts = input.provenance.facts();
  for (const f of facts) {
    const entries = input.provenance.get(f);
    if (entries.length === 0) continue;
    const head = entries[0]!;
    const sourceCounts = new Map<string, number>();
    for (const e of entries) sourceCounts.set(e.source, (sourceCounts.get(e.source) ?? 0) + 1);
    for (const [src, n] of sourceCounts) {
      if (n > 1) issues.push({ code: 'duplicate-fact', factId: f, detail: `source ${src} repeated ${n}x` });
    }
    if (head.confidence < minConf) {
      issues.push({ code: 'low-confidence', factId: f, detail: `confidence ${head.confidence}` });
    }
    if (input.now - head.recordedAt > stale) {
      issues.push({ code: 'stale', factId: f, detail: `last update ${input.now - head.recordedAt}ms ago` });
    }
  }
  const factSet = new Set(facts);
  for (const a of input.archive) {
    if (a.factId && !factSet.has(a.factId)) {
      issues.push({ code: 'orphan-archive', factId: a.factId, detail: `archive ${a.id} references missing fact` });
    }
  }
  const denom = Math.max(1, facts.length);
  const score = clamp01(1 - issues.length / denom);
  return { issues, score };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function lexicalOverlap(queryTokens: readonly string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  const tt = new Set(tokenize(text));
  let hits = 0;
  for (const q of queryTokens) if (tt.has(q)) hits++;
  return hits / queryTokens.length;
}
