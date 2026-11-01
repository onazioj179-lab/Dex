// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Memory — capped, append-only conversational + workflow memory.
 *
 * This is the SINGLE renderer persistence adapter for UKI memory. It owns the
 * hot rolling window (`uki:mem:turns`) and delegates its COLD tier to
 * `./compressedMemory`, which reads back from here, archives evicted turns, and
 * writes the trimmed window through the same key. The two modules are one store
 * across two physical cache keys — see `./compressedMemory` for the tier
 * contract. `./index_search` reads both tiers (live turns + archive summaries)
 * to build its lexical index; do not introduce a second turn store.
 *
 * Local-first: everything is stored in localStorage via the UKI cache layer.
 * Encryption is opt-in per record (cache.setAsync({ encrypted: true })).
 *
 * Memory tiers:
 *   - turns:       last N user/UKI exchanges (rolling window, default 200)
 *   - facts:       cached results from free APIs (TTL-driven, see freeApis)
 *   - workflows:   user-named recipes (manual or learned)
 *   - archive:     cold gzip summaries of evicted turns (see ./compressedMemory)
 *
 * No background timers. All retention happens lazily on write.
 *
 * Note: `src/shared/uki/memory.ts` is the pure in-memory tiered MODEL used by
 * the Memory inspector UI and tests; THIS module is its persistence adapter.
 * `src/main/uki/knowledge/UkiRewindMemory.ts` is a separate, main-process
 * recall *fusion* surface (native Rust archive + rewind timeline + knowledge
 * graph) and is intentionally not unified into this localStorage store — its
 * data lives in a different process and shape. See that file's header.
 */

import * as cache from './cache';
import {
  freshTurn,
  migrate,
  SCHEMA_VERSION,
  type UkiTurnRecord,
  type UkiWorkflowRecord,
} from './schemas';

const TURNS_KEY = 'uki:mem:turns';
const WORKFLOWS_KEY = 'uki:mem:workflows';
const MAX_TURNS = 200;
// Workflows are user/learned recipes kept in the (small) localStorage budget, so
// they are capped and quality-scored rather than allowed to grow without bound.
// (A true multi-GB memory store would need IndexedDB / native dex.db; this layer
// is localStorage-backed, so the cap is a count, not the brief's 10 GB figure.)
const MAX_WORKFLOWS = 100;

/**
 * Retention score for a workflow (higher = keep). Recency is the live signal:
 * it decays on a ~30-day scale from the record's last touch. Frequency (useCount)
 * is read with diminishing returns so a future "workflow used" hook can bump it
 * without a schema change; until such a consumer exists it is simply 0. Semantic
 * *relevance* is a query-time concern handled by `./index_search` /
 * `./semanticSearch`, not eviction.
 */
function workflowScore(w: UkiWorkflowRecord, now: number): number {
  const lastTouch = w.lastUsedTs ?? w.updatedTs ?? w.createdTs ?? now;
  const ageDays = Math.max(0, (now - lastTouch) / 86_400_000);
  const recency = Math.exp(-ageDays / 30);
  const frequency = Math.log2(1 + (w.useCount ?? 0));
  return recency + 0.5 * frequency;
}

/** Drop the lowest-scoring workflows until the list fits the cap. */
function enforceWorkflowCap(list: UkiWorkflowRecord[]): UkiWorkflowRecord[] {
  if (list.length <= MAX_WORKFLOWS) return list;
  const now = Date.now();
  return [...list]
    .sort((a, b) => workflowScore(b, now) - workflowScore(a, now))
    .slice(0, MAX_WORKFLOWS);
}

// ---------- turns ----------

const DAY_MS = 86_400_000;

/**
 * Settings > UKI & Memory, read live so a change applies to the very next turn.
 * These toggles used to be read by nothing: turning "Memory Recording" off did
 * not stop UKI (or the knowledge feeder) from storing conversations, and the
 * retention period was never applied.
 */
export function ukiMemoryPrefs(): { record: boolean; retentionMs: number | null } {
  try {
    const s = JSON.parse(localStorage.getItem('dex-settings') || '{}');
    const days = Number(s.ukiRetentionDays);
    return {
      record: s.ukiMemoryEnabled !== false,
      retentionMs: s.ukiAutoCleanup === false ? null : (Number.isFinite(days) && days > 0 ? days : 30) * DAY_MS,
    };
  } catch {
    return { record: true, retentionMs: 30 * DAY_MS };
  }
}

/** Drop turns older than the retention window (null = keep everything). */
export function applyRetention<T extends { ts: number }>(list: T[], retentionMs: number | null, now = Date.now()): T[] {
  return retentionMs == null ? list : list.filter((t) => now - t.ts <= retentionMs);
}

export async function recordTurn(
  user: string,
  ukiResponse: string,
  extras: Partial<UkiTurnRecord> = {}
): Promise<UkiTurnRecord> {
  const turn = freshTurn(user, ukiResponse, extras);
  const prefs = ukiMemoryPrefs();
  if (!prefs.record) return turn; // Memory Recording off: nothing is stored
  const list = applyRetention((await readTurns()).concat(turn), prefs.retentionMs).slice(-MAX_TURNS);
  await cache.setAsync(TURNS_KEY, list, { encrypted: true });
  // Lazy cold-tier handoff: let ./compressedMemory evict older warm turns into
  // gzip archives once the rolling window is full enough. This is the single
  // path that moves data hot -> cold; failures are non-fatal (raw window kept).
  try {
    const mod = await import('./compressedMemory');
    await mod.maybeConsolidate();
  } catch { /* compression unavailable -- keep raw window */ }
  return turn;
}

export async function readTurns(): Promise<UkiTurnRecord[]> {
  const raw = (await cache.getAsync<UkiTurnRecord[]>(TURNS_KEY)) ?? [];
  // Expired turns are never recalled, even before the next write prunes them.
  return applyRetention(raw.map((r) => migrate(r)), ukiMemoryPrefs().retentionMs);
}

export async function clearTurns(): Promise<void> {
  await cache.remove(TURNS_KEY);
}

/** Last N turns, oldest first. */
export async function recentTurns(n = 12): Promise<UkiTurnRecord[]> {
  const all = await readTurns();
  return all.slice(-n);
}

// ---------- workflows ----------

export async function listWorkflows(): Promise<UkiWorkflowRecord[]> {
  const raw = (await cache.getAsync<UkiWorkflowRecord[]>(WORKFLOWS_KEY)) ?? [];
  return raw.map((r) => migrate(r));
}

export async function saveWorkflow(
  title: string,
  steps: readonly string[],
  triggers: readonly string[] = []
): Promise<UkiWorkflowRecord> {
  const list = await listWorkflows();
  const now = Date.now();
  // Dedup by title (case-insensitive): re-saving a recipe UPDATES it in place
  // and preserves its accrued usage, instead of silently appending a duplicate
  // and growing the store unbounded.
  const norm = title.trim().toLowerCase();
  const existing = list.find((w) => w.title.trim().toLowerCase() === norm);
  const record: UkiWorkflowRecord = {
    schemaVersion: SCHEMA_VERSION,
    id: existing?.id ?? `wf_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title,
    steps,
    triggers,
    createdTs: existing?.createdTs ?? now,
    updatedTs: now,
    useCount: existing?.useCount ?? 0,
    lastUsedTs: existing?.lastUsedTs ?? now,
  };
  const next = existing
    ? list.map((w) => (w.id === existing.id ? record : w))
    : list.concat(record);
  await cache.setAsync(WORKFLOWS_KEY, enforceWorkflowCap(next));
  return record;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const list = await listWorkflows();
  await cache.setAsync(WORKFLOWS_KEY, list.filter((w) => w.id !== id));
}
