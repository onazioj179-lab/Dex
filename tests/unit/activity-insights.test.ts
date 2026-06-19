// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Learn activity-pattern insights (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { findPeakHourWindow, peakIndex } from '../../src/shared/format/activityInsights';

describe('findPeakHourWindow', () => {
  it('returns null when there is no activity', () => {
    expect(findPeakHourWindow([], 3)).toBeNull();
    expect(findPeakHourWindow(new Array(24).fill(0), 3)).toBeNull();
  });

  it('finds the busiest consecutive window', () => {
    const hours = new Array(24).fill(0);
    hours[9] = 5; hours[10] = 8; hours[11] = 6; // 9-12 is the hot zone
    const w = findPeakHourWindow(hours, 3)!;
    expect(w).toEqual({ startHour: 9, endHour: 12, score: 19 });
  });

  it('clamps the window size to the array length', () => {
    const w = findPeakHourWindow([2, 3], 5)!;
    expect(w).toEqual({ startHour: 0, endHour: 2, score: 5 });
  });

  it('resolves ties to the earliest window', () => {
    const hours = [4, 4, 0, 4, 4];
    const w = findPeakHourWindow(hours, 2)!;
    expect(w.startHour).toBe(0);
    expect(w.score).toBe(8);
  });
});

describe('peakIndex', () => {
  it('returns the index of the largest value', () => {
    expect(peakIndex([1, 9, 3])).toBe(1);
  });

  it('resolves ties to the earliest index', () => {
    expect(peakIndex([5, 5, 2])).toBe(0);
  });

  it('returns null when all values are zero', () => {
    expect(peakIndex([0, 0, 0])).toBeNull();
    expect(peakIndex([])).toBeNull();
  });
});
