// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Optimistic mutation reconciler — wave G.
 *
 * Generic state machine for "commit locally now, reconcile when the
 * server (IPC, cloud, native module) replies". Surfaces wrap their
 * read state with this so notes, tasks, files all feel instant while
 * the actual write still happens. Pure: no IPC, no React.
 */

// DEX v3.8.9 wave G - optimistic mutations

export type MutationStatus = 'pending' | 'committed' | 'rolled-back';

export interface OptimisticEntry<T> {
  id: string;
  /** What the UI should currently show. */
  value: T;
  /** What the value was before the mutation (for rollback). */
  previous: T | null;
  status: MutationStatus;
  /** When the mutation started, ms epoch. */
  startedAt: number;
  /** Why it was rolled back, if it was. */
  error?: string;
}

export interface OptimisticStore<T> {
  entries: Record<string, OptimisticEntry<T>>;
}

export function newOptimisticStore<T>(): OptimisticStore<T> {
  return { entries: {} };
}

/**
 * Begin an optimistic mutation. The new value is shown immediately;
 * the previous value is captured so a later rollback can restore it.
 */
export function beginMutation<T>(
  store: OptimisticStore<T>,
  id: string,
  next: T,
  now: number
): OptimisticStore<T> {
  const previous = store.entries[id]?.value ?? null;
  return {
    entries: {
      ...store.entries,
      [id]: { id, value: next, previous, status: 'pending', startedAt: now },
    },
  };
}

/** Server confirmed; clear the rollback snapshot. */
export function commitMutation<T>(
  store: OptimisticStore<T>,
  id: string,
  serverValue?: T
): OptimisticStore<T> {
  const entry = store.entries[id];
  if (!entry) return store;
  return {
    entries: {
      ...store.entries,
      [id]: {
        ...entry,
        value: serverValue !== undefined ? serverValue : entry.value,
        previous: null,
        status: 'committed',
      },
    },
  };
}

/** Server rejected; restore the previous value. */
export function rollbackMutation<T>(
  store: OptimisticStore<T>,
  id: string,
  error: string
): OptimisticStore<T> {
  const entry = store.entries[id];
  if (!entry) return store;
  // If there was no previous value (this was a create) drop the entry entirely.
  if (entry.previous === null) {
    const next = { ...store.entries };
    delete next[id];
    return { entries: next };
  }
  return {
    entries: {
      ...store.entries,
      [id]: {
        ...entry,
        value: entry.previous,
        previous: null,
        status: 'rolled-back',
        error,
      },
    },
  };
}

/** Read the value the UI should display. */
export function readOptimistic<T>(store: OptimisticStore<T>, id: string): T | null {
  return store.entries[id]?.value ?? null;
}

/** All entries still waiting on a server reply. */
export function pendingMutations<T>(store: OptimisticStore<T>): OptimisticEntry<T>[] {
  return Object.values(store.entries).filter((e) => e.status === 'pending');
}

/**
 * Drop entries whose `startedAt` is older than `staleMs` and never
 * resolved. Used by reliability sweep to detect dropped IPC replies.
 */
export function pruneStale<T>(
  store: OptimisticStore<T>,
  now: number,
  staleMs: number
): { store: OptimisticStore<T>; pruned: string[] } {
  const pruned: string[] = [];
  const next: Record<string, OptimisticEntry<T>> = {};
  for (const [id, entry] of Object.entries(store.entries)) {
    if (entry.status === 'pending' && now - entry.startedAt > staleMs) {
      pruned.push(id);
    } else {
      next[id] = entry;
    }
  }
  return { store: { entries: next }, pruned };
}
