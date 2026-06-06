// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { MediaJobQueue } from '../../src/shared/media/jobQueue';

describe('media job queue (#592/#598/#600)', () => {
  it('runs highest-priority first, FIFO on ties', () => {
    let t = 0;
    const q = new MediaJobQueue(() => (t += 1));
    q.add('export', { a: 1 }, 0);
    const high = q.add('proxy', { b: 2 }, 5);
    q.add('thumb', { c: 3 }, 0);
    expect(q.peekNext()!.id).toBe(high.id);
    const started = q.startNext()!;
    expect(started.id).toBe(high.id);
    expect(started.status).toBe('running');
  });

  it('tracks progress, completion and counts', () => {
    const q = new MediaJobQueue(() => 1);
    q.add('export', {}, 0);
    const r = q.startNext()!;
    q.setProgress(r.id, 50);
    expect(q.get(r.id)!.progress).toBe(50);
    q.complete(r.id);
    expect(q.get(r.id)!.status).toBe('done');
    expect(q.get(r.id)!.progress).toBe(100);
    expect(q.counts().done).toBe(1);
    expect(q.peekNext()).toBeUndefined();
  });

  it('cancels jobs and clears finished ones', () => {
    const q = new MediaJobQueue(() => 1);
    const a = q.add('x', {});
    const b = q.add('y', {});
    q.cancel(a.id);
    expect(q.get(a.id)!.status).toBe('cancelled');
    expect(q.clearFinished()).toBe(1);
    expect(q.list().map((j) => j.id)).toEqual([b.id]);
  });
});
