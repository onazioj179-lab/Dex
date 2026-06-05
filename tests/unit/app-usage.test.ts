// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { appUsage, mostUsedApp } from '../../src/shared/rewind/appUsage';

describe('app usage', () => {
  it('attributes dwell to the earlier event and sorts by time', () => {
    const usage = appUsage([
      { ts: 0, appId: 'a' },
      { ts: 1000, appId: 'b' },
      { ts: 3000, appId: 'a' },
    ]);
    expect(usage[0]).toMatchObject({ appId: 'b', ms: 2000 });
    expect(usage[1]).toMatchObject({ appId: 'a', ms: 1000 });
    expect(usage[0].share).toBeCloseTo(2 / 3, 5);
  });

  it('caps long gaps at maxGapMs', () => {
    const usage = appUsage([{ ts: 0, appId: 'a' }, { ts: 600_000, appId: 'b' }], 300_000);
    expect(usage[0]).toMatchObject({ appId: 'a', ms: 300_000 });
  });

  it('handles trivial inputs', () => {
    expect(appUsage([])).toEqual([]);
    expect(appUsage([{ ts: 0, appId: 'solo' }])).toEqual([{ appId: 'solo', ms: 0, share: 0 }]);
  });

  it('mostUsedApp returns the leader', () => {
    expect(mostUsedApp([{ ts: 0, appId: 'a' }, { ts: 1000, appId: 'b' }, { ts: 3000, appId: 'a' }])).toBe('b');
    expect(mostUsedApp([])).toBeNull();
  });
});
