// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { bucketDate, groupByDateBucket } from '../../src/shared/format/dateBucket';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime(); // Sat Jun 20 2026

describe('date bucket', () => {
  it('classifies relative to now', () => {
    expect(bucketDate(new Date(2026, 5, 20, 8, 0).getTime(), NOW)).toBe('today');
    expect(bucketDate(new Date(2026, 5, 19, 8, 0).getTime(), NOW)).toBe('yesterday');
    expect(bucketDate(new Date(2026, 5, 15, 8, 0).getTime(), NOW)).toBe('this-week');
    expect(bucketDate(new Date(2026, 5, 5, 8, 0).getTime(), NOW)).toBe('this-month');
    expect(bucketDate(new Date(2026, 4, 20, 8, 0).getTime(), NOW)).toBe('older');
  });

  it('treats future timestamps as today', () => {
    expect(bucketDate(NOW + 3_600_000, NOW)).toBe('today');
  });

  it('groups items in display order', () => {
    const items = [
      { id: 'old', ts: new Date(2026, 4, 1).getTime() },
      { id: 'now', ts: new Date(2026, 5, 20, 9).getTime() },
      { id: 'yest', ts: new Date(2026, 5, 19, 9).getTime() },
    ];
    const groups = groupByDateBucket(items, (i) => i.ts, NOW);
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'yesterday', 'older']);
    expect(groups[0].items[0].id).toBe('now');
  });
});
