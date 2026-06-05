// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeStreaks } from '../../src/shared/rewind/streak';

describe('rewind streaks', () => {
  it('returns zeros with no activity', () => {
    expect(computeStreaks([], '2026-06-04')).toEqual({ current: 0, longest: 0 });
  });

  it('counts a current streak ending today', () => {
    const days = ['2026-06-02', '2026-06-03', '2026-06-04'];
    expect(computeStreaks(days, '2026-06-04')).toEqual({ current: 3, longest: 3 });
  });

  it('treats a streak ending yesterday as still current', () => {
    const days = ['2026-06-02', '2026-06-03'];
    expect(computeStreaks(days, '2026-06-04')).toMatchObject({ current: 2 });
  });

  it('breaks the current streak after a missed day', () => {
    const days = ['2026-06-01', '2026-06-02']; // two days ago and earlier
    expect(computeStreaks(days, '2026-06-04').current).toBe(0);
  });

  it('finds the longest run regardless of current', () => {
    const days = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-06-04'];
    const r = computeStreaks(days, '2026-06-04');
    expect(r.longest).toBe(4);
    expect(r.current).toBe(1); // only today
  });

  it('ignores duplicates and invalid shards', () => {
    const days = ['2026-06-04', '2026-06-04', 'garbage', '2026-13-40'];
    expect(computeStreaks(days, '2026-06-04')).toEqual({ current: 1, longest: 1 });
  });
});
