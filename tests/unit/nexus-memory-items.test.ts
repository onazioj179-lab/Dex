// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  recencyBucket,
  recencyScore,
  rankMemoryItems,
  itemsForView,
  groupByRecency,
  DEFAULT_HALF_LIFE_MS,
  type MemoryItem,
} from '../../src/shared/nexus/memoryItems';

const at = (y: number, mo: number, d: number, h = 12) => new Date(y, mo - 1, d, h).getTime();
const NOW = at(2026, 6, 4, 15);

const item = (over: Partial<MemoryItem> & { id: string; updatedTs: number }): MemoryItem => ({
  viewId: 'projects',
  title: over.id,
  ...over,
});

describe('recencyBucket', () => {
  it('classifies relative to now', () => {
    expect(recencyBucket(at(2026, 6, 4, 9), NOW)).toBe('today');
    expect(recencyBucket(at(2026, 6, 2, 9), NOW)).toBe('week');
    expect(recencyBucket(at(2026, 5, 20, 9), NOW)).toBe('month');
    expect(recencyBucket(at(2026, 3, 1, 9), NOW)).toBe('older');
  });
});

describe('recencyScore', () => {
  it('decays by half each half-life', () => {
    const fresh = item({ id: 'a', updatedTs: NOW });
    const oneHalfLife = item({ id: 'b', updatedTs: NOW - DEFAULT_HALF_LIFE_MS });
    expect(recencyScore(fresh, NOW)).toBeCloseTo(1, 5);
    expect(recencyScore(oneHalfLife, NOW)).toBeCloseTo(0.5, 5);
  });

  it('frequency boosts the score (dampened)', () => {
    const once = item({ id: 'a', updatedTs: NOW, hits: 1 });
    const many = item({ id: 'b', updatedTs: NOW, hits: 8 });
    expect(recencyScore(many, NOW)).toBeGreaterThan(recencyScore(once, NOW));
  });
});

describe('rankMemoryItems', () => {
  it('orders by recency×frequency, most relevant first', () => {
    const items = [
      item({ id: 'old', updatedTs: NOW - 20 * 24 * 3600_000 }),
      item({ id: 'new', updatedTs: NOW - 3600_000 }),
      item({ id: 'mid', updatedTs: NOW - 3 * 24 * 3600_000 }),
    ];
    expect(rankMemoryItems(items, NOW).map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('floats pinned items above unpinned regardless of recency', () => {
    const items = [
      item({ id: 'new', updatedTs: NOW - 3600_000 }),
      item({ id: 'pinnedOld', updatedTs: NOW - 30 * 24 * 3600_000, pinned: true }),
    ];
    expect(rankMemoryItems(items, NOW).map((i) => i.id)).toEqual(['pinnedOld', 'new']);
  });

  it('can disable pinned-first', () => {
    const items = [
      item({ id: 'new', updatedTs: NOW - 3600_000 }),
      item({ id: 'pinnedOld', updatedTs: NOW - 30 * 24 * 3600_000, pinned: true }),
    ];
    expect(rankMemoryItems(items, NOW, { pinnedFirst: false }).map((i) => i.id)).toEqual(['new', 'pinnedOld']);
  });

  it('does not mutate the input', () => {
    const items = [item({ id: 'b', updatedTs: 2 }), item({ id: 'a', updatedTs: 1 })];
    const copy = [...items];
    rankMemoryItems(items, NOW);
    expect(items).toEqual(copy);
  });
});

describe('itemsForView', () => {
  it('filters by viewId', () => {
    const items = [
      item({ id: 'p', updatedTs: NOW, viewId: 'projects' }),
      item({ id: 'i', updatedTs: NOW, viewId: 'ideas' }),
    ];
    expect(itemsForView(items, 'ideas').map((i) => i.id)).toEqual(['i']);
  });
});

describe('groupByRecency', () => {
  it('splits ranked items into ordered, non-empty buckets', () => {
    const items = [
      item({ id: 'today', updatedTs: at(2026, 6, 4, 9) }),
      item({ id: 'week', updatedTs: at(2026, 6, 2, 9) }),
      item({ id: 'older', updatedTs: at(2026, 3, 1, 9) }),
    ];
    const groups = groupByRecency(items, NOW);
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'week', 'older']); // no 'month' bucket
    expect(groups.map((g) => g.label)).toEqual(['Today', 'This week', 'Older']);
    expect(groups[0].items[0].id).toBe('today');
  });

  it('keeps pinned ordering inside the right time bucket', () => {
    const items = [
      item({ id: 'a', updatedTs: at(2026, 6, 4, 8) }),
      item({ id: 'pinned', updatedTs: at(2026, 6, 4, 7), pinned: true }),
    ];
    const groups = groupByRecency(items, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].bucket).toBe('today');
    expect(groups[0].items.map((i) => i.id)).toEqual(['pinned', 'a']);
  });
});
