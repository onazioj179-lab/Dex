import { describe, it, expect } from 'vitest';
import {
  continueWorking,
  staleItems,
  groupByApp,
  relativeTime,
  resumeLabel,
  type WorkItem,
} from '../../src/shared/home/missionControl';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const NOW = 1_000_000_000_000;

const w = (id: string, appId: string, ageMs: number, extra: Partial<WorkItem> = {}): WorkItem => ({
  id,
  title: id,
  appId,
  updatedTs: NOW - ageMs,
  ...extra,
});

describe('continueWorking', () => {
  it('returns unfinished items, most recent first, capped', () => {
    const items = [
      w('a', 'vinx', 2 * HOUR),
      w('b', 'prism', 1 * HOUR),
      w('done', 'notes', 5 * HOUR, { done: true }),
      w('c', 'forge', 10 * HOUR),
    ];
    expect(continueWorking(items, { limit: 2 }).map((i) => i.id)).toEqual(['b', 'a']);
    expect(continueWorking(items).some((i) => i.id === 'done')).toBe(false);
  });
});

describe('staleItems', () => {
  it('returns unfinished items older than the threshold, most stale first', () => {
    const items = [
      w('fresh', 'vinx', 1 * HOUR),
      w('stale1', 'prism', 3 * DAY),
      w('stale2', 'forge', 9 * DAY),
      w('staleDone', 'notes', 30 * DAY, { done: true }),
    ];
    expect(staleItems(items, NOW, 2 * DAY).map((i) => i.id)).toEqual(['stale2', 'stale1']);
  });
});

describe('groupByApp', () => {
  it('groups and orders buckets + items by recency', () => {
    const items = [
      w('v1', 'vinx', 5 * HOUR),
      w('p1', 'prism', 1 * HOUR),
      w('v2', 'vinx', 30 * 60_000), // 30m — newest overall
    ];
    const buckets = groupByApp(items);
    expect(buckets.map((b) => b.appId)).toEqual(['vinx', 'prism']); // vinx has the newest item
    expect(buckets[0].items.map((i) => i.id)).toEqual(['v2', 'v1']);
  });
});

describe('relativeTime', () => {
  it('formats coarse buckets', () => {
    expect(relativeTime(10_000)).toBe('just now');
    expect(relativeTime(5 * 60_000)).toBe('5m ago');
    expect(relativeTime(2 * HOUR)).toBe('2h ago');
    expect(relativeTime(3 * DAY)).toBe('3d ago');
    expect(relativeTime(14 * DAY)).toBe('2w ago');
  });
});

describe('resumeLabel', () => {
  it('builds a resume CTA', () => {
    expect(resumeLabel(w('Trailer cut', 'vinx', 2 * HOUR), NOW)).toBe('Continue "Trailer cut" in vinx · 2h ago');
  });
});
