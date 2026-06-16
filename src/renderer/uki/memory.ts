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

// ---------- turns ----------

export async function recordTurn(
  user: string,
  ukiResponse: string,
  extras: Partial<UkiTurnRecord> = {}
): Promise<UkiTurnRecord> {
  const turn = freshTurn(user, ukiResponse, extras);
  const list = (await readTurns()).concat(turn).slice(-MAX_TURNS);
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
  return raw.map((r) => migrate(r));
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
  const id = `wf_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const record: UkiWorkflowRecord = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    steps,
    triggers,
    createdTs: now,
    updatedTs: now,
  };
  await cache.setAsync(WORKFLOWS_KEY, list.concat(record));
  return record;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const list = await listWorkflows();
  await cache.setAsync(WORKFLOWS_KEY, list.filter((w) => w.id !== id));
}
