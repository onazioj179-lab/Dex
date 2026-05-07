// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * File ops & storage primitives — wave N.
 *
 * Pure planners and state machines:
 *  - Drag-and-drop planner (move vs copy, by modifier)
 *  - Bulk operation queue with progress + cancel
 *  - Trash purge scheduler (age-based, with reprieve)
 *  - Conflict resolver (rename / overwrite / skip / keep-both)
 *  - Sync status badge resolution
 *
 * No fs, no IPC, no electron. Tests verify deterministic outcomes.
 */

// DEX v3.8.9 wave N - file ops

// -------- DnD planner ----------------------------------------------

export type DnDOperation = 'move' | 'copy' | 'link' | 'denied';

export interface DnDContext {
  /** Source root, e.g. "C:\\Users\\me\\Files". */
  sourceRoot: string;
  /** Destination root. */
  destinationRoot: string;
  /** Held modifiers at drop time. */
  modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean };
  /** True when dropping into a read-only target (e.g. recents). */
  destinationReadOnly?: boolean;
}

/**
 * Decide the drop operation:
 *  - read-only target → 'denied'
 *  - same root, no ctrl → 'move'
 *  - cross root, no ctrl → 'copy'
 *  - ctrl held → 'copy'
 *  - alt held → 'link'
 *  - shift overrides to 'move'
 */
export function planDnD(ctx: DnDContext): DnDOperation {
  if (ctx.destinationReadOnly) return 'denied';
  const m = ctx.modifiers ?? {};
  if (m.shift) return 'move';
  if (m.alt) return 'link';
  if (m.ctrl) return 'copy';
  return ctx.sourceRoot === ctx.destinationRoot ? 'move' : 'copy';
}

// -------- bulk operation queue -------------------------------------

export type BulkItemStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface BulkItem {
  id: string;
  label: string;
  status: BulkItemStatus;
  /** ms epoch when it changed status to running. */
  startedAt?: number;
  /** ms epoch when finished. */
  finishedAt?: number;
  /** Error message if failed. */
  error?: string;
}

export interface BulkQueue {
  items: BulkItem[];
  cancelled: boolean;
}

export function newBulkQueue(items: readonly Omit<BulkItem, 'status'>[]): BulkQueue {
  return {
    items: items.map((i) => ({ ...i, status: 'pending' as BulkItemStatus })),
    cancelled: false,
  };
}

export function startItem(queue: BulkQueue, id: string, now: number): BulkQueue {
  return updateItem(queue, id, (i) => ({ ...i, status: 'running', startedAt: now }));
}

export function completeItem(queue: BulkQueue, id: string, now: number): BulkQueue {
  return updateItem(queue, id, (i) => ({ ...i, status: 'done', finishedAt: now }));
}

export function failItem(queue: BulkQueue, id: string, now: number, error: string): BulkQueue {
  return updateItem(queue, id, (i) => ({ ...i, status: 'failed', finishedAt: now, error }));
}

export function cancelQueue(queue: BulkQueue, now: number): BulkQueue {
  return {
    cancelled: true,
    items: queue.items.map((i) =>
      i.status === 'pending' || i.status === 'running'
        ? { ...i, status: 'cancelled', finishedAt: now }
        : i
    ),
  };
}

function updateItem(queue: BulkQueue, id: string, fn: (i: BulkItem) => BulkItem): BulkQueue {
  return {
    ...queue,
    items: queue.items.map((i) => (i.id === id ? fn(i) : i)),
  };
}

export interface BulkProgress {
  total: number;
  done: number;
  failed: number;
  cancelled: number;
  /** [0,1] */
  fraction: number;
}

export function bulkProgress(queue: BulkQueue): BulkProgress {
  const total = queue.items.length;
  let done = 0;
  let failed = 0;
  let cancelled = 0;
  for (const i of queue.items) {
    if (i.status === 'done') done++;
    else if (i.status === 'failed') failed++;
    else if (i.status === 'cancelled') cancelled++;
  }
  const completed = done + failed + cancelled;
  return {
    total,
    done,
    failed,
    cancelled,
    fraction: total === 0 ? 1 : completed / total,
  };
}

// -------- trash purge scheduler ------------------------------------

export interface TrashItem {
  id: string;
  /** ms epoch when moved to trash. */
  deletedAt: number;
  sizeBytes: number;
  /** Optional reprieve until this ms epoch (user said "keep for now"). */
  keepUntil?: number;
}

export const TRASH_AUTO_PURGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface PurgePlan {
  toPurge: TrashItem[];
  /** Items eligible by age but under reprieve. */
  reprieved: TrashItem[];
  freedBytes: number;
}

export function planTrashPurge(items: readonly TrashItem[], now: number, ageMs: number = TRASH_AUTO_PURGE_MS): PurgePlan {
  const toPurge: TrashItem[] = [];
  const reprieved: TrashItem[] = [];
  for (const i of items) {
    if (now - i.deletedAt < ageMs) continue;
    if (i.keepUntil && i.keepUntil > now) {
      reprieved.push(i);
      continue;
    }
    toPurge.push(i);
  }
  const freedBytes = toPurge.reduce((acc, i) => acc + i.sizeBytes, 0);
  return { toPurge, reprieved, freedBytes };
}

// -------- conflict resolver ----------------------------------------

export type ConflictStrategy = 'rename' | 'overwrite' | 'skip' | 'keep-both';

export interface ConflictResolution {
  /** Final filename after resolution. Empty when skipped. */
  filename: string;
  /** True when the existing file should be deleted/overwritten. */
  deleteExisting: boolean;
  /** True when the operation should be aborted entirely. */
  skipped: boolean;
}

/**
 * Resolve a name conflict. `existingNames` is the set of files already
 * in the destination directory (case-sensitive). For 'rename' and
 * 'keep-both' we suffix " (n)" before the extension, picking the smallest
 * n that produces a unique name.
 */
export function resolveConflict(
  candidate: string,
  existingNames: ReadonlySet<string>,
  strategy: ConflictStrategy
): ConflictResolution {
  if (!existingNames.has(candidate)) {
    return { filename: candidate, deleteExisting: false, skipped: false };
  }
  if (strategy === 'overwrite') {
    return { filename: candidate, deleteExisting: true, skipped: false };
  }
  if (strategy === 'skip') {
    return { filename: '', deleteExisting: false, skipped: true };
  }
  // rename or keep-both
  const dot = candidate.lastIndexOf('.');
  const base = dot > 0 ? candidate.slice(0, dot) : candidate;
  const ext = dot > 0 ? candidate.slice(dot) : '';
  for (let n = 2; n < 1000; n++) {
    const next = `${base} (${n})${ext}`;
    if (!existingNames.has(next)) {
      return { filename: next, deleteExisting: false, skipped: false };
    }
  }
  // Fallback (shouldn't be reachable in practice)
  return { filename: `${base} (copy)${ext}`, deleteExisting: false, skipped: false };
}

// -------- sync status badge ----------------------------------------

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error' | 'conflict';

export interface SyncProbe {
  online: boolean;
  hasConflict: boolean;
  hasError: boolean;
  /** Items waiting to upload. */
  pendingCount: number;
  /** Items currently uploading. */
  inFlightCount: number;
}

/** Resolve a single status from a sync probe (priority order). */
export function syncBadge(probe: SyncProbe): SyncStatus {
  if (probe.hasError) return 'error';
  if (probe.hasConflict) return 'conflict';
  if (!probe.online) return 'offline';
  if (probe.inFlightCount > 0) return 'syncing';
  if (probe.pendingCount > 0) return 'pending';
  return 'synced';
}

export const SYNC_BADGE_LABELS: Record<SyncStatus, string> = {
  synced: 'Up to date',
  syncing: 'Syncing...',
  pending: 'Waiting to sync',
  offline: 'Offline',
  error: 'Sync error',
  conflict: 'Conflict — needs review',
};
