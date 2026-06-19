// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX 5.6 — Stage (Project Space) activity log.
 * -----------------------------------------------------------------------------
 * A lightweight, persisted, timestamped record of Project Space switches. The
 * stage store tracks only the CURRENT active space; this log keeps the history
 * (which space was active WHEN) so time-based surfaces — Rewind in particular —
 * can attribute a past session to the workspace the user was in at the time.
 *
 * Renderer-only (localStorage); recorded from `stageStore.setActiveStage`.
 */

export interface StageActivityEntry {
  stageId: string;
  name: string;
  kind: string;
  /** ms epoch when this space became active. */
  ts: number;
}

const KEY = 'dex-stage-activity-log';
const MAX = 500;

function load(): StageActivityEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.stageId === 'string' && typeof e.ts === 'number') : [];
  } catch {
    return [];
  }
}

let log: StageActivityEntry[] = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch { /* quota — drop silently */ }
}

/** Append a transition. Repeats of the current space are ignored. */
export function recordStageActivity(e: { stageId: string; name: string; kind: string; ts?: number }): void {
  const ts = e.ts ?? Date.now();
  const last = log[log.length - 1];
  if (last && last.stageId === e.stageId) return;
  log.push({ stageId: e.stageId, name: e.name, kind: e.kind || 'general', ts });
  if (log.length > MAX) log = log.slice(-MAX);
  persist();
}

/**
 * The Project Space that was active at a given moment — the most recent
 * transition whose timestamp is at or before `ts`. Undefined if the log has no
 * coverage that far back (honest: no badge rather than a wrong one).
 */
export function spaceAt(ts: number): StageActivityEntry | undefined {
  // The most recent transition at or before `ts`. Scans rather than break-early
  // so an out-of-order entry (clock change) can't truncate the search.
  let found: StageActivityEntry | undefined;
  for (const e of log) {
    if (e.ts <= ts && (!found || e.ts > found.ts)) found = e;
  }
  return found;
}

/** The full log (oldest first), for inspection / summaries. */
export function getStageActivityLog(): readonly StageActivityEntry[] {
  return log;
}
