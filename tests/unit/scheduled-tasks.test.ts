// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the scheduled-task engine (shared/automation/scheduledTasks):
 * cron + interval next-run computation, due detection, and retry-with-backoff
 * state transitions (success reschedules the next slot, failures back off then
 * give up to the next cadence).
 */
import { describe, it, expect } from 'vitest';
import {
  computeNextRun,
  initNextRun,
  isDue,
  dueTasks,
  applyRunResult,
  describeSchedule,
  type ScheduledTask,
} from '../../src/shared/automation/scheduledTasks';

function task(partial: Partial<ScheduledTask>): ScheduledTask {
  return {
    id: 't1', title: 'Test', kind: 'interval', intervalMs: 3_600_000,
    action: { type: 'reminder', message: 'hi' },
    enabled: true, createdAt: 0,
    nextRunAt: null, attempt: 0, maxAttempts: 3, runCount: 0,
    ...partial,
  };
}

// A fixed reference moment: 2026-07-02 10:30:00 local.
const T = new Date(2026, 6, 2, 10, 30, 0, 0).getTime();

describe('computeNextRun — interval', () => {
  it('adds the interval to `from`', () => {
    expect(computeNextRun({ kind: 'interval', intervalMs: 900_000 }, T)).toBe(T + 900_000);
  });
  it('returns null for sub-second intervals', () => {
    expect(computeNextRun({ kind: 'interval', intervalMs: 500 }, T)).toBeNull();
  });
});

describe('computeNextRun — cron', () => {
  it('finds the next matching minute strictly after `from`', () => {
    // "0 11 * * *" → 11:00 today (after 10:30)
    const next = computeNextRun({ kind: 'cron', cron: '0 11 * * *' }, T)!;
    const d = new Date(next);
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(2);
  });

  it('rolls to the next day when today has passed', () => {
    // "0 9 * * *" → 9:00, already past at 10:30 → tomorrow
    const next = computeNextRun({ kind: 'cron', cron: '0 9 * * *' }, T)!;
    const d = new Date(next);
    expect(d.getHours()).toBe(9);
    expect(d.getDate()).toBe(3);
  });

  it('handles step syntax (every 15 min)', () => {
    const next = computeNextRun({ kind: 'cron', cron: '*/15 * * * *' }, T)!;
    const d = new Date(next);
    expect(d.getMinutes()).toBe(45); // 10:30 → next quarter is 10:45
  });

  it('returns null for an invalid cron', () => {
    expect(computeNextRun({ kind: 'cron', cron: 'not a cron' }, T)).toBeNull();
    expect(computeNextRun({ kind: 'cron', cron: undefined }, T)).toBeNull();
  });
});

describe('initNextRun / isDue / dueTasks', () => {
  it('schedules an enabled task and not a disabled one', () => {
    expect(initNextRun(task({ enabled: true }), T).nextRunAt).toBe(T + 3_600_000);
    expect(initNextRun(task({ enabled: false }), T).nextRunAt).toBeNull();
  });

  it('isDue only when enabled and now >= nextRunAt', () => {
    const t = task({ nextRunAt: T });
    expect(isDue(t, T - 1)).toBe(false);
    expect(isDue(t, T)).toBe(true);
    expect(isDue({ ...t, enabled: false }, T + 1000)).toBe(false);
    expect(isDue({ ...t, nextRunAt: null }, T)).toBe(false);
  });

  it('dueTasks returns due tasks soonest-first', () => {
    const a = task({ id: 'a', nextRunAt: T - 5000 });
    const b = task({ id: 'b', nextRunAt: T - 20000 });
    const c = task({ id: 'c', nextRunAt: T + 60000 }); // not due
    const out = dueTasks([a, b, c], T);
    expect(out.map(t => t.id)).toEqual(['b', 'a']);
  });
});

describe('applyRunResult', () => {
  it('success resets attempt and schedules the next slot', () => {
    const t = task({ kind: 'interval', intervalMs: 600_000, attempt: 2, nextRunAt: T });
    const out = applyRunResult(t, T, 'ok', undefined);
    expect(out.lastOutcome).toBe('ok');
    expect(out.attempt).toBe(0);
    expect(out.nextRunAt).toBe(T + 600_000);
    expect(out.runCount).toBe(1);
    expect(out.lastError).toBeUndefined();
  });

  it('failure with retries left backs off (attempt increments)', () => {
    const t = task({ maxAttempts: 3, attempt: 0, nextRunAt: T });
    const out = applyRunResult(t, T, 'error', 'boom', { baseMs: 1000, factor: 2 });
    expect(out.lastOutcome).toBe('error');
    expect(out.lastError).toBe('boom');
    expect(out.attempt).toBe(1);
    // attempt 0 backoff = base 1000ms, clamped to >= 1000
    expect(out.nextRunAt).toBe(T + 1000);
  });

  it('backoff grows with the attempt', () => {
    const t = task({ maxAttempts: 5, attempt: 2, nextRunAt: T });
    const out = applyRunResult(t, T, 'error', 'boom', { baseMs: 1000, factor: 2 });
    // attempt 2 backoff = 1000 * 2^2 = 4000
    expect(out.nextRunAt).toBe(T + 4000);
    expect(out.attempt).toBe(3);
  });

  it('failure with no retries left resumes normal cadence', () => {
    const t = task({ kind: 'interval', intervalMs: 600_000, maxAttempts: 3, attempt: 2, nextRunAt: T });
    const out = applyRunResult(t, T, 'error', 'still failing', { baseMs: 1000 });
    expect(out.attempt).toBe(0);            // gave up this cycle
    expect(out.nextRunAt).toBe(T + 600_000); // back to the schedule
    expect(out.lastOutcome).toBe('error');
  });

  it('a disabled task never reschedules', () => {
    const t = task({ enabled: false, nextRunAt: T });
    const out = applyRunResult(t, T, 'ok', undefined);
    expect(out.nextRunAt).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('summarizes intervals', () => {
    expect(describeSchedule({ kind: 'interval', intervalMs: 15 * 60000 })).toBe('every 15 min');
    expect(describeSchedule({ kind: 'interval', intervalMs: 3 * 3600000 })).toBe('every 3 hr');
    expect(describeSchedule({ kind: 'interval', intervalMs: 2 * 86400000 })).toBe('every 2 d');
  });
  it('summarizes cron', () => {
    expect(describeSchedule({ kind: 'cron', cron: '0 9 * * *' })).toBe('cron: 0 9 * * *');
  });
});
