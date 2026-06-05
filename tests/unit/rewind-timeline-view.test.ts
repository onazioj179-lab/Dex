import { describe, it, expect } from 'vitest';
import { buildTimeline, type ActivityEvent } from '../../src/shared/rewind/timeline';
import {
  startOfDay,
  dayHeading,
  groupSessionsByDay,
  timeOfDay,
  describeSession,
  formatDuration,
  filterSessions,
} from '../../src/shared/rewind/timelineView';

// Local-time constructed timestamps → deterministic regardless of runner TZ
// (both `now` and events use the same local construction).
const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).getTime();

describe('startOfDay / dayHeading', () => {
  it('startOfDay zeroes the time component', () => {
    const t = at(2026, 6, 4, 14, 30);
    expect(startOfDay(t)).toBe(at(2026, 6, 4, 0, 0));
  });

  it('labels Today / Yesterday / older as a date', () => {
    const today = startOfDay(at(2026, 6, 4, 9));
    expect(dayHeading(startOfDay(at(2026, 6, 4, 23)), today)).toBe('Today');
    expect(dayHeading(startOfDay(at(2026, 6, 3, 1)), today)).toBe('Yesterday');
    expect(dayHeading(startOfDay(at(2026, 6, 1, 12)), today)).toBe('2026-06-01');
  });
});

describe('timeOfDay', () => {
  it('buckets the hour of day', () => {
    expect(timeOfDay(at(2026, 6, 4, 3))).toBe('night');
    expect(timeOfDay(at(2026, 6, 4, 9))).toBe('morning');
    expect(timeOfDay(at(2026, 6, 4, 14))).toBe('afternoon');
    expect(timeOfDay(at(2026, 6, 4, 19))).toBe('evening');
    expect(timeOfDay(at(2026, 6, 4, 23))).toBe('night');
  });
});

describe('formatDuration', () => {
  it('formats compactly', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(12_000)).toBe('12s');
    expect(formatDuration(5 * 60_000)).toBe('5m');
    expect(formatDuration(5 * 60_000 + 9_000)).toBe('5m 9s');
    expect(formatDuration(60 * 60_000)).toBe('1h');
    expect(formatDuration(83 * 60_000)).toBe('1h 23m');
    expect(formatDuration(-100)).toBe('0s');
  });
});

describe('describeSession', () => {
  it('produces a richer human label than the raw one', () => {
    const [s] = buildTimeline([
      { ts: at(2026, 6, 4, 14, 0), appId: 'vinx', kind: 'edit' },
      { ts: at(2026, 6, 4, 14, 5), appId: 'vinx', kind: 'edit' },
      { ts: at(2026, 6, 4, 14, 6), appId: 'prism', kind: 'open' },
    ]);
    expect(describeSession(s)).toBe('Afternoon in vinx +1 app — 3 events');
  });

  it('singularizes a one-event, single-app session', () => {
    const [s] = buildTimeline([{ ts: at(2026, 6, 4, 9, 0), appId: 'notes', kind: 'open' }]);
    expect(describeSession(s)).toBe('Morning in notes — 1 event');
  });
});

describe('groupSessionsByDay', () => {
  it('buckets by local day, newest day and newest session first', () => {
    const sessions = buildTimeline([
      // Day 1 (older) — two sessions split by a >30min gap
      { ts: at(2026, 6, 2, 10, 0), appId: 'notes', kind: 'edit' },
      { ts: at(2026, 6, 2, 13, 0), appId: 'vinx', kind: 'edit' },
      // Day 2 (newer)
      { ts: at(2026, 6, 3, 9, 0), appId: 'prism', kind: 'edit' },
    ]);
    const now = at(2026, 6, 3, 20, 0);
    const groups = groupSessionsByDay(sessions, now);

    expect(groups.map((g) => g.heading)).toEqual(['Today', 'Yesterday']);
    expect(groups[0].sessions).toHaveLength(1);
    expect(groups[1].sessions).toHaveLength(2);
    // within the older day, newest session first
    expect(groups[1].sessions[0].startTs).toBeGreaterThan(groups[1].sessions[1].startTs);
  });

  it('returns [] for no sessions', () => {
    expect(groupSessionsByDay([], at(2026, 6, 4, 12))).toEqual([]);
  });
});

describe('filterSessions', () => {
  const events: ActivityEvent[] = [
    { ts: at(2026, 6, 1, 9, 0), appId: 'vinx', kind: 'edit' },
    { ts: at(2026, 6, 2, 9, 0), appId: 'prism', kind: 'edit' },
    { ts: at(2026, 6, 3, 9, 0), appId: 'notes', kind: 'edit' },
  ];
  const sessions = buildTimeline(events);

  it('filters by app id', () => {
    const out = filterSessions(sessions, { appId: 'prism' });
    expect(out).toHaveLength(1);
    expect(out[0].primaryAppId).toBe('prism');
  });

  it('filters by time window (inclusive)', () => {
    const out = filterSessions(sessions, { from: at(2026, 6, 2, 0), to: at(2026, 6, 2, 23) });
    expect(out.map((s) => s.primaryAppId)).toEqual(['prism']);
  });

  it('filters by case-insensitive text query over label + apps', () => {
    expect(filterSessions(sessions, { query: 'VINX' })).toHaveLength(1);
    expect(filterSessions(sessions, { query: 'nomatch' })).toHaveLength(0);
  });

  it('returns all on an empty filter', () => {
    expect(filterSessions(sessions, {})).toHaveLength(3);
  });
});
