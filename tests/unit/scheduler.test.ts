// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.0 - Scheduler tests

import { describe, it, expect } from 'vitest';
import { shouldFireTimeBased, type ScheduledTrigger } from '../../src/shared/uki/schedulerLogic';

function trig(spec: ScheduledTrigger['spec'], lastFiredAt = 0): ScheduledTrigger {
  return {
    id: 't', action: 'demo', label: 'demo', enabled: true,
    createdAt: 0, lastFiredAt, spec,
  };
}

describe('Scheduler.shouldFireTimeBased', () => {
  it('fires everyMinutes when interval has elapsed', () => {
    const now = new Date('2026-05-06T12:30:00');
    const t = trig({ kind: 'everyMinutes', minutes: 5 }, now.getTime() - 6 * 60_000);
    expect(shouldFireTimeBased(t, now)).toBe(true);
  });

  it('does not fire everyMinutes too early', () => {
    const now = new Date('2026-05-06T12:30:00');
    const t = trig({ kind: 'everyMinutes', minutes: 5 }, now.getTime() - 30_000);
    expect(shouldFireTimeBased(t, now)).toBe(false);
  });

  it('fires dailyAt at the right minute', () => {
    const now = new Date('2026-05-06T17:00:00');
    const t = trig({ kind: 'dailyAt', time: '17:00' }, 0);
    expect(shouldFireTimeBased(t, now)).toBe(true);
  });

  it('weekly respects day-of-week', () => {
    const now = new Date('2026-05-06T09:00:00');
    const t = trig({ kind: 'weekly', dow: 3, time: '09:00' }, 0);
    expect(now.getDay()).toBe(3);
    expect(shouldFireTimeBased(t, now)).toBe(true);
    const wrong = trig({ kind: 'weekly', dow: 0, time: '09:00' }, 0);
    expect(shouldFireTimeBased(wrong, now)).toBe(false);
  });

  it('disabled trigger never fires', () => {
    const t = { ...trig({ kind: 'everyMinutes', minutes: 1 }, 0), enabled: false };
    expect(shouldFireTimeBased(t, new Date())).toBe(false);
  });
});
