// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Calendar conflict detection (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { findEventConflicts, TimedEvent } from '../../src/shared/calendar/eventConflicts';

const ev = (id: string, date: string, start: number, end: number): TimedEvent => ({ id, date, start, end });

describe('findEventConflicts', () => {
  it('returns an empty set for non-overlapping events', () => {
    const c = findEventConflicts([
      ev('a', '2026-06-18', 540, 600),  // 09:00-10:00
      ev('b', '2026-06-18', 600, 660),  // 10:00-11:00 (touches, not overlapping)
    ]);
    expect(c.size).toBe(0);
  });

  it('flags both events when they overlap', () => {
    const c = findEventConflicts([
      ev('a', '2026-06-18', 540, 660),  // 09:00-11:00
      ev('b', '2026-06-18', 600, 720),  // 10:00-12:00
    ]);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(true);
  });

  it('does not flag overlaps across different days', () => {
    const c = findEventConflicts([
      ev('a', '2026-06-18', 540, 660),
      ev('b', '2026-06-19', 540, 660),
    ]);
    expect(c.size).toBe(0);
  });

  it('flags every member of a triple overlap but leaves an isolated event alone', () => {
    const c = findEventConflicts([
      ev('a', '2026-06-18', 540, 660),
      ev('b', '2026-06-18', 560, 620),
      ev('c', '2026-06-18', 600, 700),
      ev('d', '2026-06-18', 800, 860),  // isolated
    ]);
    expect([...c].sort()).toEqual(['a', 'b', 'c']);
    expect(c.has('d')).toBe(false);
  });

  it('handles an event fully contained within another', () => {
    const c = findEventConflicts([
      ev('outer', '2026-06-18', 540, 720),
      ev('inner', '2026-06-18', 580, 600),
    ]);
    expect(c.has('outer')).toBe(true);
    expect(c.has('inner')).toBe(true);
  });
});
