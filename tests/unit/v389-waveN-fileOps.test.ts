// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave N - file ops tests

import { describe, it, expect } from 'vitest';
import {
  SYNC_BADGE_LABELS,
  TRASH_AUTO_PURGE_MS,
  bulkProgress,
  cancelQueue,
  completeItem,
  failItem,
  newBulkQueue,
  planDnD,
  planTrashPurge,
  resolveConflict,
  startItem,
  syncBadge,
} from '../../src/shared/cloud/fileOps';

// -------- DnD planner ---------------------------------------------

describe('wave N - DnD planner', () => {
  const ctx = (over: Partial<Parameters<typeof planDnD>[0]> = {}) => ({
    sourceRoot: '/A',
    destinationRoot: '/A',
    modifiers: {},
    ...over,
  });

  it('same root defaults to move', () => {
    expect(planDnD(ctx())).toBe('move');
  });

  it('cross root defaults to copy', () => {
    expect(planDnD(ctx({ destinationRoot: '/B' }))).toBe('copy');
  });

  it('ctrl forces copy', () => {
    expect(planDnD(ctx({ modifiers: { ctrl: true } }))).toBe('copy');
  });

  it('alt forces link', () => {
    expect(planDnD(ctx({ modifiers: { alt: true } }))).toBe('link');
  });

  it('shift forces move even cross-root', () => {
    expect(planDnD(ctx({ destinationRoot: '/B', modifiers: { shift: true } }))).toBe('move');
  });

  it('read-only target denies', () => {
    expect(planDnD(ctx({ destinationReadOnly: true }))).toBe('denied');
  });
});

// -------- bulk queue ---------------------------------------------

describe('wave N - bulk queue', () => {
  const queue = () => newBulkQueue([
    { id: '1', label: 'a' },
    { id: '2', label: 'b' },
    { id: '3', label: 'c' },
  ]);

  it('progress is 0 at start', () => {
    expect(bulkProgress(queue()).fraction).toBe(0);
  });

  it('completion advances progress', () => {
    let q = queue();
    q = startItem(q, '1', 0);
    q = completeItem(q, '1', 1);
    expect(bulkProgress(q)).toMatchObject({ done: 1, fraction: 1 / 3 });
  });

  it('failures count toward progress', () => {
    let q = queue();
    q = failItem(q, '1', 0, 'oops');
    q = completeItem(q, '2', 1);
    const p = bulkProgress(q);
    expect(p.failed).toBe(1);
    expect(p.done).toBe(1);
    expect(p.fraction).toBeCloseTo(2 / 3);
  });

  it('cancelQueue marks pending+running as cancelled', () => {
    let q = queue();
    q = startItem(q, '1', 0);
    q = completeItem(q, '1', 1);
    q = cancelQueue(q, 2);
    expect(q.cancelled).toBe(true);
    expect(q.items.find((i) => i.id === '2')!.status).toBe('cancelled');
    expect(q.items.find((i) => i.id === '1')!.status).toBe('done');
  });

  it('empty queue progress is 1', () => {
    expect(bulkProgress(newBulkQueue([])).fraction).toBe(1);
  });
});

// -------- trash purge --------------------------------------------

describe('wave N - trash purge', () => {
  it('default age is 30 days', () => {
    expect(TRASH_AUTO_PURGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('purges items older than age', () => {
    const now = TRASH_AUTO_PURGE_MS + 100_000;
    const r = planTrashPurge(
      [
        { id: 'a', deletedAt: 0, sizeBytes: 100 },
        { id: 'b', deletedAt: now - 1000, sizeBytes: 200 },
      ],
      now
    );
    expect(r.toPurge.map((i) => i.id)).toEqual(['a']);
    expect(r.freedBytes).toBe(100);
  });

  it('reprieve keeps items even if eligible', () => {
    const now = TRASH_AUTO_PURGE_MS + 100;
    const r = planTrashPurge(
      [{ id: 'a', deletedAt: 0, sizeBytes: 50, keepUntil: now + 1000 }],
      now
    );
    expect(r.toPurge).toHaveLength(0);
    expect(r.reprieved).toHaveLength(1);
  });

  it('expired reprieve still purges', () => {
    const now = TRASH_AUTO_PURGE_MS + 100;
    const r = planTrashPurge(
      [{ id: 'a', deletedAt: 0, sizeBytes: 50, keepUntil: now - 1000 }],
      now
    );
    expect(r.toPurge).toHaveLength(1);
  });
});

// -------- conflict resolver --------------------------------------

describe('wave N - conflict resolver', () => {
  it('returns candidate as-is when no conflict', () => {
    const r = resolveConflict('a.txt', new Set(), 'rename');
    expect(r.filename).toBe('a.txt');
  });

  it('overwrite asks to delete existing', () => {
    const r = resolveConflict('a.txt', new Set(['a.txt']), 'overwrite');
    expect(r.deleteExisting).toBe(true);
    expect(r.filename).toBe('a.txt');
  });

  it('skip yields skipped', () => {
    const r = resolveConflict('a.txt', new Set(['a.txt']), 'skip');
    expect(r.skipped).toBe(true);
  });

  it('rename suffixes with smallest free n', () => {
    const r = resolveConflict('a.txt', new Set(['a.txt', 'a (2).txt']), 'rename');
    expect(r.filename).toBe('a (3).txt');
  });

  it('keep-both suffixes too', () => {
    const r = resolveConflict('a.txt', new Set(['a.txt']), 'keep-both');
    expect(r.filename).toBe('a (2).txt');
  });

  it('handles no-extension files', () => {
    const r = resolveConflict('README', new Set(['README']), 'rename');
    expect(r.filename).toBe('README (2)');
  });
});

// -------- sync badge ---------------------------------------------

describe('wave N - sync badge', () => {
  it('synced when nothing pending and online', () => {
    expect(syncBadge({ online: true, hasConflict: false, hasError: false, pendingCount: 0, inFlightCount: 0 })).toBe('synced');
  });

  it('error trumps everything', () => {
    expect(syncBadge({ online: false, hasConflict: true, hasError: true, pendingCount: 5, inFlightCount: 1 })).toBe('error');
  });

  it('conflict trumps offline', () => {
    expect(syncBadge({ online: false, hasConflict: true, hasError: false, pendingCount: 0, inFlightCount: 0 })).toBe('conflict');
  });

  it('offline when offline and no flags', () => {
    expect(syncBadge({ online: false, hasConflict: false, hasError: false, pendingCount: 1, inFlightCount: 0 })).toBe('offline');
  });

  it('syncing when in-flight', () => {
    expect(syncBadge({ online: true, hasConflict: false, hasError: false, pendingCount: 0, inFlightCount: 2 })).toBe('syncing');
  });

  it('pending when only queued', () => {
    expect(syncBadge({ online: true, hasConflict: false, hasError: false, pendingCount: 3, inFlightCount: 0 })).toBe('pending');
  });

  it('all statuses have labels', () => {
    expect(SYNC_BADGE_LABELS.synced).toBe('Up to date');
    expect(SYNC_BADGE_LABELS.error).toContain('error');
  });
});
