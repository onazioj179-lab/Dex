// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { dueAlerts, occursOn, alertText } from '../../src/renderer/services/calendarReminders';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('calendar alerts', () => {
  const ev = { id: 'e1', title: 'Standup', date: '2026-11-18', time: '09:30', alertMinutes: 15 };

  it('fires once in the window before the start, not before, not twice', () => {
    expect(dueAlerts([ev], at(2026, 11, 18, 9, 10), at(2026, 11, 18, 9, 14), new Set())).toEqual([]);
    const due = dueAlerts([ev], at(2026, 11, 18, 9, 14), at(2026, 11, 18, 9, 15), new Set());
    expect(due.map((d) => d.key)).toEqual(['e1@2026-11-18']);
    expect(dueAlerts([ev], at(2026, 11, 18, 9, 14), at(2026, 11, 18, 9, 15), new Set(['e1@2026-11-18']))).toEqual([]);
    expect(alertText(due[0], at(2026, 11, 18, 9, 15))).toMatch(/^In 15 min/);
  });

  it('events without an alert never fire; long-missed alerts are not replayed', () => {
    expect(dueAlerts([{ ...ev, alertMinutes: null }], 0, at(2026, 11, 18, 9, 15), new Set())).toEqual([]);
    expect(dueAlerts([ev], 0, at(2026, 11, 18, 10, 0), new Set())).toEqual([]); // 45 min late
  });

  it('repeating events alert on each occurrence; a 1-day-before alert fires the day before', () => {
    const weekly = { ...ev, recurring: 'weekly' as const };
    expect(dueAlerts([weekly], at(2026, 11, 25, 9, 14), at(2026, 11, 25, 9, 15), new Set()).map((d) => d.key)).toEqual(['e1@2026-11-25']);
    expect(occursOn(weekly, new Date(2026, 10, 26))).toBe(false);
    const dayBefore = { ...ev, id: 'e2', alertMinutes: 1440 };
    expect(dueAlerts([dayBefore], at(2026, 11, 17, 9, 29), at(2026, 11, 17, 9, 30), new Set()).map((d) => d.key)).toEqual(['e2@2026-11-18']);
    expect(occursOn({ ...weekly, recurUntil: '2026-11-20' }, new Date(2026, 10, 25))).toBe(false);
  });
});
