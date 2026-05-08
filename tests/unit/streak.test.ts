// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { EMPTY_STREAK, daysBetween, localDayKey, recordLaunch, tooltipFor } from '../../src/shared/engagement/streak';

describe('streak', () => {
  it('localDayKey formats local Y-M-D', () => {
    const d = new Date(2026, 4, 8, 14, 30); // May 8 2026 14:30 local
    expect(localDayKey(d)).toBe('2026-05-08');
  });

  it('daysBetween returns positive for forward, negative for back', () => {
    expect(daysBetween('2026-05-01', '2026-05-08')).toBe(7);
    expect(daysBetween('2026-05-08', '2026-05-01')).toBe(-7);
    expect(Number.isNaN(daysBetween('', '2026-05-08'))).toBe(true);
    expect(Number.isNaN(daysBetween('not-a-date', '2026-05-08'))).toBe(true);
  });

  it('first launch yields current=1, longest=1, totalDays=1', () => {
    const s = recordLaunch(EMPTY_STREAK, new Date(2026, 4, 8));
    expect(s).toEqual({ current: 1, longest: 1, totalDays: 1, lastDay: '2026-05-08' });
  });

  it('same-day relaunch is a no-op', () => {
    const s1 = recordLaunch(EMPTY_STREAK, new Date(2026, 4, 8, 9, 0));
    const s2 = recordLaunch(s1, new Date(2026, 4, 8, 17, 30));
    expect(s2).toBe(s1);
  });

  it('next-day launch increments current and bumps longest if exceeded', () => {
    let s = recordLaunch(EMPTY_STREAK, new Date(2026, 4, 6));
    s = recordLaunch(s, new Date(2026, 4, 7));
    s = recordLaunch(s, new Date(2026, 4, 8));
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.totalDays).toBe(3);
  });

  it('skipping a day resets current to 1 but keeps longest + totalDays', () => {
    let s = recordLaunch(EMPTY_STREAK, new Date(2026, 4, 6));
    s = recordLaunch(s, new Date(2026, 4, 7));
    s = recordLaunch(s, new Date(2026, 4, 8));
    expect(s.current).toBe(3);
    s = recordLaunch(s, new Date(2026, 4, 10)); // skipped 9th
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
    expect(s.totalDays).toBe(4);
  });

  it('clock running backwards (e.g. wrong system date) resets without crashing', () => {
    let s = recordLaunch(EMPTY_STREAK, new Date(2026, 4, 8));
    s = recordLaunch(s, new Date(2026, 4, 1));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it('tooltipFor shows day count and best when greater than current', () => {
    expect(tooltipFor({ current: 0, longest: 0, totalDays: 0, lastDay: '' })).toBe('DEX');
    expect(tooltipFor({ current: 1, longest: 1, totalDays: 1, lastDay: 'x' })).toBe('Day 1 - DEX');
    expect(tooltipFor({ current: 5, longest: 12, totalDays: 30, lastDay: 'x' })).toBe('Day 5 - DEX (best 12)');
  });
});
