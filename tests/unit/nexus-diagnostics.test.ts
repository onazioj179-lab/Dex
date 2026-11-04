// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Local diagnostics collector: launch history, errors, frame summaries.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordLaunch, recordError, getSnapshot, clearLaunches, percentile, summariseFrames,
} from '../../src/renderer/services/diagnostics/localMetrics';

describe('local diagnostics', () => {
  beforeEach(() => { localStorage.clear(); clearLaunches(); });

  it('keeps launch samples (numbers and app ids only) and caps the history', () => {
    for (let i = 0; i < 60; i++) recordLaunch('notes', 100 + i, 1000 + i);
    const snap = getSnapshot();
    expect(snap.launches).toHaveLength(50);
    expect(snap.launches[49]).toEqual({ appId: 'notes', ms: 159, at: 1059 });
    expect(Object.keys(JSON.parse(localStorage.getItem('dex-diag-launches')!)[0]).sort()).toEqual(['appId', 'at', 'ms']);
  });

  it('ignores impossible durations', () => {
    recordLaunch('notes', -5);
    recordLaunch('notes', Number.NaN);
    expect(getSnapshot().launches).toHaveLength(0);
  });

  it('counts errors and keeps short messages', () => {
    const before = getSnapshot().errors.count;
    recordError('x'.repeat(500), 'error');
    const snap = getSnapshot();
    expect(snap.errors.count).toBe(before + 1);
    expect(snap.errors.recent[0].message).toHaveLength(200);
  });

  it('summarises frames and percentiles', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([], 95)).toBe(0);
    const f = summariseFrames([16, 16, 17, 40, 16], 105);
    expect(f.frames).toBe(5);
    expect(f.slowFrames).toBe(1);
    expect(f.p95).toBe(40);
    expect(f.fps).toBe(48);
  });
});
