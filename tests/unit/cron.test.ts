// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseCron, cronMatches, matchesCron } from '../../src/shared/automation/cron';

describe('cron', () => {
  it('parses fields including ranges, lists and steps', () => {
    const spec = parseCron('0 9 * * 1-5');
    expect([...spec.minute]).toEqual([0]);
    expect([...spec.hour]).toEqual([9]);
    expect([...spec.dayOfWeek]).toEqual([1, 2, 3, 4, 5]);
    expect(parseCron('*/15 * * * *').minute).toEqual(new Set([0, 15, 30, 45]));
  });

  it('matches a specific date', () => {
    const spec = parseCron('0 9 1 6 *'); // 09:00 on June 1
    expect(cronMatches(spec, new Date(2026, 5, 1, 9, 0, 0))).toBe(true);
    expect(cronMatches(spec, new Date(2026, 5, 1, 10, 0, 0))).toBe(false);
  });

  it('matchesCron handles steps and invalid specs', () => {
    expect(matchesCron('*/15 * * * *', new Date(2026, 5, 1, 9, 30))).toBe(true);
    expect(matchesCron('*/15 * * * *', new Date(2026, 5, 1, 9, 31))).toBe(false);
    expect(matchesCron('bad expr here', new Date())).toBe(false);
  });

  it('rejects malformed fields', () => {
    expect(() => parseCron('99 * * * *')).toThrow();
    expect(() => parseCron('* * *')).toThrow();
  });
});
