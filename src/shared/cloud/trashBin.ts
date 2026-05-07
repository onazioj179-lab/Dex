// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Trash bin: soft-delete with TTL.
 *
 * Deleted items go here for `ttlDays` (default 30). The user can restore
 * any time before purge. The compactor sweeps expired items.
 */

// DEX v3.8.9 - trash bin

export interface TrashEntry {
  id: string;
  originalPath: string;
  bytes: number;
  deletedAt: number;
  /** Where to put it back when restored. May differ from originalPath if collision. */
  restorePath?: string;
}

export interface TrashState {
  entries: TrashEntry[];
  ttlDays: number;
}

export const DEFAULT_TRASH_TTL_DAYS = 30;

export function createTrashState(ttlDays: number = DEFAULT_TRASH_TTL_DAYS): TrashState {
  return { entries: [], ttlDays };
}

export function pushToTrash(state: TrashState, entry: Omit<TrashEntry, 'deletedAt'>, now: number = Date.now()): TrashState {
  return { ...state, entries: [...state.entries, { ...entry, deletedAt: now }] };
}

export function restoreFromTrash(state: TrashState, id: string): { state: TrashState; restored?: TrashEntry } {
  const found = state.entries.find((e) => e.id === id);
  if (!found) return { state };
  return { state: { ...state, entries: state.entries.filter((e) => e.id !== id) }, restored: found };
}

export function purgeFromTrash(state: TrashState, id: string): TrashState {
  return { ...state, entries: state.entries.filter((e) => e.id !== id) };
}

export function expiredEntries(state: TrashState, now: number = Date.now()): TrashEntry[] {
  const ttl = state.ttlDays * 24 * 60 * 60 * 1000;
  return state.entries.filter((e) => now - e.deletedAt >= ttl);
}

export function sweepExpired(state: TrashState, now: number = Date.now()): { state: TrashState; purged: TrashEntry[] } {
  const purged = expiredEntries(state, now);
  if (purged.length === 0) return { state, purged: [] };
  const purgedIds = new Set(purged.map((p) => p.id));
  return { state: { ...state, entries: state.entries.filter((e) => !purgedIds.has(e.id)) }, purged };
}

export function trashSize(state: TrashState): number {
  return state.entries.reduce((sum, e) => sum + e.bytes, 0);
}
