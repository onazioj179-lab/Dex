// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { parseLocalDate, toLocalDateInput, repairPickedDay } from '../../src/renderer/utils/localDate';

describe('local calendar days', () => {
  it('a picked day is that local day, in any time zone', () => {
    const d = parseLocalDate('2026-11-18')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 18, 0]);
    expect(toLocalDateInput(d)).toBe('2026-11-18');
  });
  it('values with a time keep their meaning; junk is null', () => {
    expect(parseLocalDate('2026-11-18T15:30:00Z')!.toISOString()).toBe('2026-11-18T15:30:00.000Z');
    expect(parseLocalDate('nope')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(toLocalDateInput(null)).toBe('');
  });
  it('repairs days saved at UTC midnight by the old bug, leaves real times alone', () => {
    const r = repairPickedDay('2026-11-18T00:00:00.000Z')!;
    expect(toLocalDateInput(r)).toBe('2026-11-18');
    expect(repairPickedDay('2026-11-18T09:15:00.000Z')!.toISOString()).toBe('2026-11-18T09:15:00.000Z');
    expect(repairPickedDay(null)).toBeNull();
  });
});
