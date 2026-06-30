// =============================================================================
// DEX Platform — cross-session recall date resolver tests
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveRecallDate } from '../../src/shared/rewind/recall';

// Fixed clock: 2026-06-30 12:00 (a Tuesday).
const NOW = new Date(2026, 5, 30, 12, 0, 0);

describe('resolveRecallDate', () => {
  it('resolves today / yesterday', () => {
    expect(resolveRecallDate('today', NOW)).toBe('2026-06-30');
    expect(resolveRecallDate('Yesterday', NOW)).toBe('2026-06-29');
  });

  it('resolves "N days ago"', () => {
    expect(resolveRecallDate('3 days ago', NOW)).toBe('2026-06-27');
    expect(resolveRecallDate('1 day ago', NOW)).toBe('2026-06-29');
  });

  it('passes through a valid ISO date and rejects junk', () => {
    expect(resolveRecallDate('2026-06-25', NOW)).toBe('2026-06-25');
    expect(resolveRecallDate('not a date', NOW)).toBeNull();
    expect(resolveRecallDate('', NOW)).toBeNull();
  });

  it('resolves a weekday to the most recent PAST occurrence', () => {
    const thu = resolveRecallDate('last thursday', NOW);
    expect(thu).not.toBeNull();
    const d = new Date(`${thu}T00:00:00`);
    expect(d.getDay()).toBe(4);                       // Thursday
    expect(d.getTime()).toBeLessThan(NOW.getTime());  // strictly in the past
    // bare weekday works too
    expect(resolveRecallDate('thursday', NOW)).toBe(thu);
  });

  it('never resolves a weekday to today (goes back a full week)', () => {
    // Asking for NOW's own weekday must return exactly 7 days earlier, not today.
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const res = resolveRecallDate(names[NOW.getDay()], NOW)!;
    const back7 = new Date(NOW);
    back7.setDate(back7.getDate() - 7);
    const exp = `${back7.getFullYear()}-${String(back7.getMonth() + 1).padStart(2, '0')}-${String(back7.getDate()).padStart(2, '0')}`;
    expect(res).toBe(exp);
  });
});
