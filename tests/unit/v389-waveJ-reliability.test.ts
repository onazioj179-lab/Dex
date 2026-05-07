// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave J - reliability primitive tests

import { describe, it, expect } from 'vitest';
import {
  AUTOSAVE_INTERVAL_MS,
  CRASH_QUEUE_CAPACITY,
  DEFAULT_BACKOFF,
  DISK_BLOCK_THRESHOLD_BYTES,
  DISK_WARN_THRESHOLD_BYTES,
  canCall,
  checkDisk,
  enqueueCrash,
  markUploaded,
  newAutosaveStore,
  newBreaker,
  newCrashQueue,
  nextBackoffMs,
  pendingUploads,
  readSnapshot,
  recordFailure,
  recordSnapshot,
  recordSuccess,
  shouldSnapshot,
  summariseNativeHealth,
} from '../../src/shared/security/reliability';

// -------- autosave -----------------------------------------------------

describe('wave J - autosave snapshots', () => {
  it('default interval is 60s', () => {
    expect(AUTOSAVE_INTERVAL_MS).toBe(60_000);
  });

  it('always snapshots on first call', () => {
    expect(shouldSnapshot(newAutosaveStore(), 'b1', 'h1', 0)).toBe(true);
  });

  it('skips when content hash is identical', () => {
    let s = newAutosaveStore<string>();
    s = recordSnapshot(s, { bufferId: 'b1', takenAt: 0, contentHash: 'h1', payload: 'x' });
    expect(shouldSnapshot(s, 'b1', 'h1', 999_999)).toBe(false);
  });

  it('snapshots when hash differs and interval has elapsed', () => {
    let s = newAutosaveStore<string>();
    s = recordSnapshot(s, { bufferId: 'b1', takenAt: 0, contentHash: 'h1', payload: 'x' });
    expect(shouldSnapshot(s, 'b1', 'h2', 60_000)).toBe(true);
    expect(shouldSnapshot(s, 'b1', 'h2', 30_000)).toBe(false);
  });

  it('forceOnBlur snapshots immediately when content differs', () => {
    let s = newAutosaveStore<string>();
    s = recordSnapshot(s, { bufferId: 'b1', takenAt: 0, contentHash: 'h1', payload: 'x' });
    expect(shouldSnapshot(s, 'b1', 'h2', 5, { forceOnBlur: true })).toBe(true);
    expect(shouldSnapshot(s, 'b1', 'h1', 5, { forceOnBlur: true })).toBe(false);
  });

  it('readSnapshot returns the latest', () => {
    let s = newAutosaveStore<string>();
    s = recordSnapshot(s, { bufferId: 'b1', takenAt: 0, contentHash: 'h1', payload: 'first' });
    s = recordSnapshot(s, { bufferId: 'b1', takenAt: 1, contentHash: 'h2', payload: 'second' });
    expect(readSnapshot(s, 'b1')?.payload).toBe('second');
  });
});

// -------- backoff -----------------------------------------------------

describe('wave J - exponential backoff', () => {
  it('attempt 0 returns 0', () => {
    expect(nextBackoffMs(0, DEFAULT_BACKOFF, () => 0.5)).toBe(0);
  });

  it('attempt 1 = baseMs (no jitter when random=0.5)', () => {
    const policy = { baseMs: 100, maxMs: 10_000, factor: 2, jitter: 0 };
    expect(nextBackoffMs(1, policy)).toBe(100);
  });

  it('doubles each attempt under default factor', () => {
    const policy = { baseMs: 100, maxMs: 10_000, factor: 2, jitter: 0 };
    expect(nextBackoffMs(2, policy)).toBe(200);
    expect(nextBackoffMs(3, policy)).toBe(400);
    expect(nextBackoffMs(4, policy)).toBe(800);
  });

  it('clamps to maxMs', () => {
    const policy = { baseMs: 100, maxMs: 500, factor: 2, jitter: 0 };
    expect(nextBackoffMs(10, policy)).toBe(500);
  });

  it('jitter widens around the base value', () => {
    const policy = { baseMs: 1000, maxMs: 10_000, factor: 2, jitter: 0.2 };
    // random=1 → +20% biased to +200
    expect(nextBackoffMs(1, policy, () => 1)).toBeGreaterThan(1000);
    // random=0 → -20%
    expect(nextBackoffMs(1, policy, () => 0)).toBeLessThan(1000);
  });
});

// -------- circuit breaker --------------------------------------------

describe('wave J - circuit breaker', () => {
  it('starts closed and allows calls', () => {
    const b = newBreaker();
    expect(b.state).toBe('closed');
    expect(canCall(b, 0).allow).toBe(true);
  });

  it('trips open after threshold failures', () => {
    let b = newBreaker(3, 1000);
    b = recordFailure(b, 0);
    b = recordFailure(b, 0);
    expect(b.state).toBe('closed');
    b = recordFailure(b, 0);
    expect(b.state).toBe('open');
    expect(canCall(b, 100).allow).toBe(false);
  });

  it('transitions to half-open after cooldown and allows one probe', () => {
    let b = newBreaker(1, 100);
    b = recordFailure(b, 0);
    expect(b.state).toBe('open');
    const r = canCall(b, 200);
    expect(r.allow).toBe(true);
    expect(r.next.state).toBe('half-open');
  });

  it('half-open success closes the breaker', () => {
    let b = newBreaker(1, 100);
    b = recordFailure(b, 0);
    b = canCall(b, 200).next;
    b = recordSuccess(b);
    expect(b.state).toBe('closed');
    expect(b.failures).toBe(0);
  });

  it('half-open failure re-opens the breaker', () => {
    let b = newBreaker(1, 100);
    b = recordFailure(b, 0);
    b = canCall(b, 200).next;
    b = recordFailure(b, 300);
    expect(b.state).toBe('open');
    expect(b.openedAt).toBe(300);
  });
});

// -------- native health summary -------------------------------------

describe('wave J - native module health', () => {
  it('reports ok when version matches and loaded', () => {
    const r = summariseNativeHealth([{ name: 'dex-native', version: '1.0.0', expected: '1.0.0', loaded: true }]);
    expect(r[0].status).toBe('ok');
  });

  it('reports mismatch when versions differ', () => {
    const r = summariseNativeHealth([{ name: 'dex-native', version: '0.9.0', expected: '1.0.0', loaded: true }]);
    expect(r[0].status).toBe('mismatch');
    expect(r[0].suggestion).toContain('Rebuild');
  });

  it('reports failed when load errored', () => {
    const r = summariseNativeHealth([{ name: 'dex-native', version: '', expected: '1.0.0', loaded: false, error: 'ENOENT' }]);
    expect(r[0].status).toBe('failed');
  });

  it('reports missing when not loaded and no error', () => {
    const r = summariseNativeHealth([{ name: 'dex-native', version: '', expected: '1.0.0', loaded: false }]);
    expect(r[0].status).toBe('missing');
  });
});

// -------- disk guard ------------------------------------------------

describe('wave J - disk guard', () => {
  it('ok above warn threshold', () => {
    const r = checkDisk(DISK_WARN_THRESHOLD_BYTES + 1);
    expect(r.state).toBe('ok');
  });

  it('warn between block and warn thresholds', () => {
    const r = checkDisk((DISK_BLOCK_THRESHOLD_BYTES + DISK_WARN_THRESHOLD_BYTES) / 2);
    expect(r.state).toBe('warn');
  });

  it('block under block threshold', () => {
    const r = checkDisk(DISK_BLOCK_THRESHOLD_BYTES - 1);
    expect(r.state).toBe('block');
    expect(r.message).toMatch(/paused/);
  });
});

// -------- crash queue ----------------------------------------------

describe('wave J - crash report queue', () => {
  const sample = (id: string, consent = false): Parameters<typeof enqueueCrash>[1] => ({
    id, occurredAt: 0, kind: 'render', message: 'oops', appVersion: '3.8.9',
    uploadConsent: consent, uploaded: false,
  });

  it('default capacity is 50', () => {
    expect(CRASH_QUEUE_CAPACITY).toBe(50);
  });

  it('dedupes by id', () => {
    let q = newCrashQueue();
    q = enqueueCrash(q, sample('a'));
    q = enqueueCrash(q, sample('a'));
    expect(q.reports).toHaveLength(1);
  });

  it('trims to capacity FIFO', () => {
    let q = newCrashQueue(2);
    q = enqueueCrash(q, sample('a'));
    q = enqueueCrash(q, sample('b'));
    q = enqueueCrash(q, sample('c'));
    expect(q.reports.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('pendingUploads only includes consented and not-yet-uploaded', () => {
    let q = newCrashQueue();
    q = enqueueCrash(q, sample('a', false));
    q = enqueueCrash(q, sample('b', true));
    q = enqueueCrash(q, sample('c', true));
    q = markUploaded(q, 'b');
    const p = pendingUploads(q).map((r) => r.id);
    expect(p).toEqual(['c']);
  });
});
