// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  appUsageBreakdown,
  activeHours,
  busiestHour,
  distinctApps,
} from '../../src/shared/rewind/analytics';
import type { ActivityEvent } from '../../src/shared/rewind/timeline';

function at(hour: number, appId: string): ActivityEvent {
  const d = new Date(2026, 5, 4, hour, 0, 0);
  return { ts: d.getTime(), appId, kind: 'focus' };
}

describe('rewind analytics', () => {
  it('breaks down per-app usage, busiest first, with shares', () => {
    const evts = [at(9, 'vinx'), at(9, 'vinx'), at(10, 'browser'), at(11, 'vinx')];
    const usage = appUsageBreakdown(evts);
    expect(usage[0]).toMatchObject({ appId: 'vinx', count: 3 });
    expect(usage[0].share).toBeCloseTo(0.75, 5);
    expect(usage[1]).toMatchObject({ appId: 'browser', count: 1 });
  });

  it('counts active hours by local hour', () => {
    const hours = activeHours([at(9, 'a'), at(9, 'b'), at(14, 'a')]);
    expect(hours[9]).toBe(2);
    expect(hours[14]).toBe(1);
    expect(hours[0]).toBe(0);
    expect(hours).toHaveLength(24);
  });

  it('finds the busiest hour', () => {
    expect(busiestHour([at(9, 'a'), at(9, 'b'), at(14, 'a')])).toBe(9);
    expect(busiestHour([])).toBeNull();
  });

  it('counts distinct apps', () => {
    expect(distinctApps([at(9, 'a'), at(9, 'a'), at(10, 'b')])).toBe(2);
  });

  it('handles an empty stream', () => {
    expect(appUsageBreakdown([])).toEqual([]);
  });
});
