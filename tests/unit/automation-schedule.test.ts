import { describe, it, expect } from 'vitest';
import { nextDue, isDue, msUntilDue, type Recurrence } from '../../src/shared/automation/schedule';

describe('automation schedule', () => {
  it('interval: fires everyMs after last run', () => {
    const rec: Recurrence = { kind: 'interval', everyMs: 1000 };
    expect(nextDue(rec, 5000)).toBe(6000);
    expect(isDue(rec, 5000, 6000)).toBe(true);
    expect(isDue(rec, 5000, 5999)).toBe(false);
    expect(msUntilDue(rec, 5000, 5400)).toBe(600);
  });

  it('daily: next occurrence of HH:MM local', () => {
    const rec: Recurrence = { kind: 'daily', hour: 9 };
    const from8 = new Date(2026, 5, 4, 8, 0, 0).getTime();
    expect(nextDue(rec, from8)).toBe(new Date(2026, 5, 4, 9, 0, 0).getTime()); // same day 9:00
    const from10 = new Date(2026, 5, 4, 10, 0, 0).getTime();
    expect(nextDue(rec, from10)).toBe(new Date(2026, 5, 5, 9, 0, 0).getTime()); // next day 9:00
  });

  it('weekly: next matching weekday at HH:MM', () => {
    const rec: Recurrence = { kind: 'weekly', weekday: 1, hour: 10 }; // Monday 10:00
    const from = new Date(2026, 5, 4, 12, 0, 0).getTime();
    const due = new Date(nextDue(rec, from));
    expect(due.getDay()).toBe(1);
    expect(due.getHours()).toBe(10);
    expect(due.getTime()).toBeGreaterThan(from);
  });
});
