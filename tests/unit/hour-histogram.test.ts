// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { hourHistogram, peakHour, activityInWindow } from '../../src/shared/rewind/hourHistogram';

const at = (hour: number) => ({ ts: new Date(2026, 5, 1, hour, 0, 0).getTime() });

describe('hour histogram', () => {
  it('buckets events by local hour', () => {
    const bins = hourHistogram([at(9), at(9), at(14)]);
    expect(bins).toHaveLength(24);
    expect(bins[9]).toBe(2);
    expect(bins[14]).toBe(1);
    expect(bins[0]).toBe(0);
  });

  it('finds the peak hour', () => {
    expect(peakHour([at(9), at(9), at(14)])).toBe(9);
    expect(peakHour([])).toBe(-1);
  });

  it('sums a window, including past-midnight wrap', () => {
    const events = [at(9), at(9), at(14), at(23), at(1)];
    expect(activityInWindow(events, 8, 12)).toBe(2);      // hours 8-11 → two at 9
    expect(activityInWindow(events, 22, 2)).toBe(2);      // 22,23,0,1 → 23 and 1
  });
});
