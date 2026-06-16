// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI memory store. Three tiers — short-term (recent context), working
 * (current session goals), long-term (durable facts). Pure data + Map.
 *
 * Role (audit FINDING 8): this is the canonical in-memory MODEL for UKI memory
 * (used by the Memory inspector UI and tests). Persistence is NOT here — the
 * single renderer persistence adapter is `src/renderer/uki/memory.ts`, whose
 * cold tier is `src/renderer/uki/compressedMemory.ts`. The main-process recall
 * fusion surface `src/main/uki/knowledge/UkiRewindMemory.ts` is a separate,
 * read-only blender over other sources, not a copy of this store. Keep this
 * module pure (no I/O) so it stays the shared shape both processes reason about.
 */

// DEX v3.8.9 - UKI brain: memory

export type MemoryKind = 'short' | 'working' | 'long';

export interface MemoryItem {
  id: string;
  content: string;
  kind: MemoryKind;
  createdAt: number;
  accessedAt: number;
  /** 0..1 — drives pruning order. */
  importance: number;
  tags: string[];
  /** Optional source attribution. */
  source?: string;
}

export interface MemoryStore {
  items: Map<string, MemoryItem>;
}

export function createMemoryStore(): MemoryStore { return { items: new Map() }; }

export interface AddMemoryInput {
  id?: string;
  content: string;
  kind?: MemoryKind;
  importance?: number;
  tags?: string[];
  source?: string;
  now?: number;
}

let _seq = 0;
function nextId(): string { _seq += 1; return `mem-${_seq}`; }

export function addMemory(store: MemoryStore, input: AddMemoryInput): MemoryItem {
  const now = input.now ?? Date.now();
  const item: MemoryItem = {
    id: input.id ?? nextId(),
    content: input.content,
    kind: input.kind ?? 'short',
    createdAt: now,
    accessedAt: now,
    importance: clamp01(input.importance ?? 0.5),
    tags: input.tags ?? [],
    source: input.source,
  };
  store.items.set(item.id, item);
  return item;
}

export interface RecallOptions {
  kind?: MemoryKind;
  tags?: string[];
  limit?: number;
  now?: number;
}

/**
 * Recall by simple substring match + tag filter, scored by importance and
 * recency. Returns highest-scoring items first; touches accessedAt.
 */
export function recallMemory(store: MemoryStore, query: string, opts: RecallOptions = {}): MemoryItem[] {
  const q = (query ?? '').toLowerCase().trim();
  const limit = opts.limit ?? 10;
  const now = opts.now ?? Date.now();
  const scored: Array<{ item: MemoryItem; score: number }> = [];
  for (const item of store.items.values()) {
    if (opts.kind && item.kind !== opts.kind) continue;
    if (opts.tags && opts.tags.length > 0) {
      if (!opts.tags.every((t) => item.tags.includes(t))) continue;
    }
    let score = 0;
    if (q) {
      if (item.content.toLowerCase().includes(q)) score += 10;
      else continue;
    } else {
      score += 1;
    }
    score += item.importance * 5;
    const ageHours = Math.max(0, (now - item.accessedAt) / 3_600_000);
    score -= Math.min(ageHours / 24, 5);
    scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, limit).map((x) => x.item);
  for (const item of out) item.accessedAt = now;
  return out;
}

export function forgetMemory(store: MemoryStore, id: string): boolean {
  return store.items.delete(id);
}

/** Drop short-term items older than maxAgeMs. Returns count removed. */
export function pruneShortTerm(store: MemoryStore, maxAgeMs: number, now: number = Date.now()): number {
  let removed = 0;
  for (const [id, item] of store.items) {
    if (item.kind !== 'short') continue;
    if (now - item.accessedAt > maxAgeMs) { store.items.delete(id); removed += 1; }
  }
  return removed;
}

/** Promote a memory to long-term, capping importance at >= 0.7. */
export function promoteToLongTerm(store: MemoryStore, id: string): MemoryItem | undefined {
  const item = store.items.get(id);
  if (!item) return undefined;
  item.kind = 'long';
  if (item.importance < 0.7) item.importance = 0.7;
  return item;
}

/** Export all memories as a JSON-friendly array (for user inspection). */
export function exportMemories(store: MemoryStore): MemoryItem[] {
  return Array.from(store.items.values()).map((m) => ({ ...m, tags: [...m.tags] }));
}

function clamp01(n: number): number { return Math.min(1, Math.max(0, n)); }

/** Reset internal id counter (test determinism). */
export function _resetMemoryIds(): void { _seq = 0; }
