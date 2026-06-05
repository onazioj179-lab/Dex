// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { summarizeDay } from '../../src/shared/rewind/daySummary';

describe('day summary', () => {
  it('is empty for no events', () => {
    expect(summarizeDay([])).toEqual({
      eventCount: 0, focus: 0, topApp: null, totalActiveMs: 0, peakHour: null,
    });
  });

  it('summarizes a focused single-app day', () => {
    const base = new Date(2026, 5, 4, 9, 0, 0).getTime();
    const s = summarizeDay([
      { ts: base, appId: 'a' },
      { ts: base + 1000, appId: 'a' },
      { ts: base + 2000, appId: 'a' },
    ]);
    expect(s.eventCount).toBe(3);
    expect(s.focus).toBe(100);
    expect(s.topApp).toBe('a');
    expect(s.totalActiveMs).toBe(2000);
    expect(s.peakHour).toBe(9);
  });

  it('reports the busiest app for a mixed day', () => {
    const base = new Date(2026, 5, 4, 14, 0, 0).getTime();
    const s = summarizeDay([
      { ts: base, appId: 'a' },
      { ts: base + 5000, appId: 'b' },
      { ts: base + 6000, appId: 'a' },
    ]);
    // 'a' accrues 5000ms dwell, 'b' accrues 1000ms.
    expect(s.topApp).toBe('a');
    expect(s.peakHour).toBe(14);
  });
});
