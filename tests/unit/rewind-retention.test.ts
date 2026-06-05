// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { shardToTime, shardAgeDays, expiredShards } from '../../src/shared/rewind/retention';

const NOW = new Date(2026, 5, 4).getTime(); // 2026-06-04 local midnight

describe('rewind retention', () => {
  it('parses valid shards and rejects invalid/rollover dates', () => {
    expect(shardToTime('2026-06-04')).toBe(NOW);
    expect(shardToTime('2026-13-01')).toBeNull();
    expect(shardToTime('2026-02-30')).toBeNull();
    expect(shardToTime('not-a-date')).toBeNull();
  });

  it('computes shard age in days', () => {
    expect(shardAgeDays('2026-06-04', NOW)).toBe(0);
    expect(shardAgeDays('2026-06-01', NOW)).toBe(3);
    expect(shardAgeDays('bad', NOW)).toBeNull();
  });

  it('returns shards older than the retention window', () => {
    const shards = ['2026-06-04', '2026-06-01', '2026-05-20', '2026-05-01', 'garbage'];
    const expired = expiredShards(shards, 7, NOW);
    expect(expired).toEqual(['2026-05-01', '2026-05-20']); // > 7 days old, sorted
  });

  it('keeps everything when retention is 0 or negative', () => {
    expect(expiredShards(['2026-01-01'], 0, NOW)).toEqual([]);
    expect(expiredShards(['2026-01-01'], -5, NOW)).toEqual([]);
  });
});
