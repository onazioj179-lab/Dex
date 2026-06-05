// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { weekSummary } from '../../src/shared/rewind/weekSummary';
import type { DaySummary } from '../../src/shared/rewind/daySummary';

const day = (eventCount: number, focus: number, topApp: string | null, totalActiveMs: number): DaySummary =>
  ({ eventCount, focus, topApp, totalActiveMs, peakHour: 9 });

describe('week summary', () => {
  it('is empty for no days', () => {
    expect(weekSummary([])).toEqual({
      days: 0, totalEvents: 0, totalActiveMs: 0, avgFocus: 0, topApp: null, busiestDayIndex: -1,
    });
  });

  it('aggregates totals, average focus and top app', () => {
    const s = weekSummary([
      day(5, 80, 'a', 1000),
      day(3, 60, 'a', 500),
      day(0, 0, null, 0), // inactive day excluded from avg
    ]);
    expect(s.days).toBe(3);
    expect(s.totalEvents).toBe(8);
    expect(s.totalActiveMs).toBe(1500);
    expect(s.avgFocus).toBe(70); // mean of 80, 60 over the 2 active days
    expect(s.topApp).toBe('a');
    expect(s.busiestDayIndex).toBe(0); // 5 events is the most
  });
});
