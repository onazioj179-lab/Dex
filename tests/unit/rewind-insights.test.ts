import { describe, it, expect } from 'vitest';
import { rewindInsights } from '../../src/shared/rewind/insights';

const D = (h: number, m: number, appId: string) => ({ ts: new Date(2026, 5, 1, h, m, 0).getTime(), appId });

describe('rewind insights (integration)', () => {
  it('composes sessions, usage, histogram, focus and streaks', () => {
    const events = [D(9, 0, 'a'), D(9, 1, 'a'), D(14, 0, 'b')];
    const ins = rewindInsights(events, '2026-06-01');

    expect(ins.eventCount).toBe(3);
    expect(ins.sessionCount).toBe(2); // 9:0x and 14:00 are > idle gap apart
    expect(ins.topApp).toBe('a');
    expect(ins.peakHour).toBe(9);
    expect(ins.hourHistogram[9]).toBe(2);
    expect(ins.hourHistogram[14]).toBe(1);
    expect(ins.activeDays).toEqual(['2026-06-01']);
    expect(ins.streaks).toEqual({ current: 1, longest: 1 });
    expect(ins.focus).toBeGreaterThan(0);
  });

  it('is empty-safe', () => {
    const ins = rewindInsights([], '2026-06-01');
    expect(ins.eventCount).toBe(0);
    expect(ins.sessionCount).toBe(0);
    expect(ins.topApp).toBeNull();
    expect(ins.peakHour).toBe(-1);
  });
});
