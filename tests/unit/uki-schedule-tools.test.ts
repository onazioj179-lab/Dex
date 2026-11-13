// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { parseScheduleSpec, parseClock } from '../../src/shared/automation/scheduleSpec';
import { computeNextRun, applyRunResult, initNextRun, describeSchedule, type ScheduledTask } from '../../src/shared/automation/scheduledTasks';
import { decideToolCall } from '../../src/shared/uki/assistantPolicy';
import { isKnownTool, validateToolCall } from '../../src/shared/uki/toolValidation';
import { useScheduledTasksStore } from '../../src/renderer/store/scheduledTasksStore';
import { scheduleTaskTool, listScheduledTasksTool, cancelScheduledTaskTool } from '../../src/renderer/uki/scheduleTools';

// Wednesday 11 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 11, 10, 0, 0, 0).getTime();
const local = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m, 0, 0).getTime();

describe('parseClock', () => {
  it('reads 24h, am/pm, noon, midnight', () => {
    expect(parseClock('9')).toEqual({ h: 9, m: 0 });
    expect(parseClock('21:05')).toEqual({ h: 21, m: 5 });
    expect(parseClock('9.30pm')).toEqual({ h: 21, m: 30 });
    expect(parseClock('12am')).toEqual({ h: 0, m: 0 });
    expect(parseClock('12 pm')).toEqual({ h: 12, m: 0 });
    expect(parseClock('noon')).toEqual({ h: 12, m: 0 });
    expect(parseClock('25')).toBeNull();
    expect(parseClock('13pm')).toBeNull();
    expect(parseClock('9:75')).toBeNull();
  });
});

describe('parseScheduleSpec', () => {
  it('relative one-time', () => {
    expect(parseScheduleSpec('in 20 minutes', NOW)).toMatchObject({ ok: true, kind: 'once', atMs: NOW + 20 * 60_000 });
    expect(parseScheduleSpec('in an hour', NOW)).toMatchObject({ ok: true, kind: 'once', atMs: NOW + 3_600_000 });
    expect(parseScheduleSpec('In 2 days.', NOW)).toMatchObject({ ok: true, kind: 'once', atMs: NOW + 2 * 86_400_000 });
    expect(parseScheduleSpec('in 3 fortnights', NOW).ok).toBe(false);
  });

  it('clock times: today, tomorrow, next occurrence, weekday', () => {
    expect(parseScheduleSpec('at 3pm', NOW)).toMatchObject({ kind: 'once', atMs: local(11, 15) });
    expect(parseScheduleSpec('at 9', NOW)).toMatchObject({ kind: 'once', atMs: local(12, 9) }); // 9:00 passed → tomorrow
    expect(parseScheduleSpec('tomorrow at 9am', NOW)).toMatchObject({ kind: 'once', atMs: local(12, 9) });
    expect(parseScheduleSpec('friday at 08:30', NOW)).toMatchObject({ kind: 'once', atMs: local(13, 8, 30) });
    expect(parseScheduleSpec('wednesday at 9', NOW)).toMatchObject({ kind: 'once', atMs: local(18, 9) }); // today's passed → next week
    expect(parseScheduleSpec('today at 8am', NOW)).toMatchObject({ ok: false });
  });

  it('absolute dates', () => {
    expect(parseScheduleSpec('2026-12-01 14:30', NOW)).toMatchObject({ kind: 'once', atMs: new Date(2026, 11, 1, 14, 30).getTime() });
    expect(parseScheduleSpec('2026-12-01', NOW)).toMatchObject({ kind: 'once', atMs: new Date(2026, 11, 1, 9, 0).getTime() });
    expect(parseScheduleSpec('2025-01-01 09:00', NOW).ok).toBe(false);
    expect(parseScheduleSpec('2026-02-30', NOW).ok).toBe(false);
  });

  it('intervals, with a one-minute floor', () => {
    expect(parseScheduleSpec('every 2 hours', NOW)).toMatchObject({ kind: 'interval', intervalMs: 7_200_000 });
    expect(parseScheduleSpec('every hour', NOW)).toMatchObject({ kind: 'interval', intervalMs: 3_600_000 });
    expect(parseScheduleSpec('hourly', NOW)).toMatchObject({ kind: 'interval', intervalMs: 3_600_000 });
    expect(parseScheduleSpec('every 30 seconds', NOW).ok).toBe(false);
  });

  it('recurring clock times become cron', () => {
    expect(parseScheduleSpec('every day at 7:15', NOW)).toMatchObject({ kind: 'cron', cron: '15 7 * * *' });
    expect(parseScheduleSpec('daily at 6pm', NOW)).toMatchObject({ kind: 'cron', cron: '0 18 * * *' });
    expect(parseScheduleSpec('weekdays at 08:30', NOW)).toMatchObject({ kind: 'cron', cron: '30 8 * * 1-5' });
    expect(parseScheduleSpec('weekends at noon', NOW)).toMatchObject({ kind: 'cron', cron: '0 12 * * 0,6' });
    expect(parseScheduleSpec('every monday at 9', NOW)).toMatchObject({ kind: 'cron', cron: '0 9 * * 1' });
    expect(parseScheduleSpec('on fridays at 17:00', NOW)).toMatchObject({ kind: 'cron', cron: '0 17 * * 5' });
    expect(parseScheduleSpec('every blursday at 9', NOW).ok).toBe(false);
  });

  it('raw cron passes through; garbage is an error with a hint', () => {
    expect(parseScheduleSpec('0 9 * * 1-5', NOW)).toMatchObject({ kind: 'cron', cron: '0 9 * * 1-5' });
    expect(parseScheduleSpec('99 9 * * *', NOW).ok).toBe(false);
    const bad = parseScheduleSpec('whenever', NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Try/);
  });
});

describe('scheduled task engine — once', () => {
  const base: ScheduledTask = {
    id: 't', title: 'x', kind: 'once', atMs: NOW + 60_000, action: { type: 'reminder' },
    enabled: true, createdAt: NOW, nextRunAt: null, attempt: 0, maxAttempts: 2, runCount: 0,
  };
  it('fires at atMs only while it is in the future', () => {
    expect(computeNextRun(base, NOW)).toBe(NOW + 60_000);
    expect(computeNextRun(base, NOW + 60_000)).toBeNull();
    expect(initNextRun(base, NOW).nextRunAt).toBe(NOW + 60_000);
    expect(describeSchedule(base)).toBe('once: 2026-11-11 10:01');
  });
  it('success turns it off; failure retries then stops', () => {
    const t = initNextRun(base, NOW);
    const done = applyRunResult(t, NOW + 60_000, 'ok', undefined);
    expect(done).toMatchObject({ enabled: false, nextRunAt: null, runCount: 1, lastOutcome: 'ok' });
    const retry = applyRunResult(t, NOW + 60_000, 'error', 'boom', { baseMs: 5000, jitter: false });
    expect(retry.enabled).toBe(true);
    expect(retry.nextRunAt).toBe(NOW + 65_000);
    const gaveUp = applyRunResult(retry, NOW + 65_000, 'error', 'boom', { baseMs: 5000, jitter: false });
    expect(gaveUp).toMatchObject({ enabled: false, nextRunAt: null, lastError: 'boom' });
  });
});

describe('UKI schedule tools', () => {
  beforeEach(() => useScheduledTasksStore.getState().clearAll());

  it('are known core tools; creating/deleting always asks first, listing does not', () => {
    for (const t of ['schedule_task', 'list_scheduled_tasks', 'cancel_scheduled_task']) expect(isKnownTool(t)).toBe(true);
    const granted = new Set<string>();
    expect(decideToolCall({ tool: 'schedule_task', mode: 'hybrid', granted }).kind).toBe('confirm');
    expect(decideToolCall({ tool: 'cancel_scheduled_task', mode: 'hybrid', granted }).kind).toBe('confirm');
    expect(decideToolCall({ tool: 'list_scheduled_tasks', mode: 'hybrid', granted }).kind).toBe('allow');
    expect(validateToolCall('schedule_task', { title: 'x' }).ok).toBe(false);
    expect(validateToolCall('schedule_task', { title: 'x', when: 'in 5 minutes' }).ok).toBe(true);
  });

  it('schedule → list → cancel round trip through the real store', () => {
    const r = scheduleTaskTool({ title: 'Stretch', when: 'every 1 hour', message: 'Stand up' }, NOW);
    expect(r).toMatch(/^Scheduled "Stretch" \(every 1 hour; a notification\)/);
    const r2 = scheduleTaskTool({ title: 'Weather brief', when: 'tomorrow at 7am', prompt: 'Summarise the weather' }, NOW);
    expect(r2).toMatch(/UKI will run the request/);
    const tasks = useScheduledTasksStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    const brief = tasks.find((t) => t.title === 'Weather brief')!;
    expect(brief).toMatchObject({ kind: 'once', atMs: local(12, 7), nextRunAt: local(12, 7), action: { type: 'uki-prompt', prompt: 'Summarise the weather' } });
    expect(tasks.find((t) => t.title === 'Stretch')!.action).toEqual({ type: 'reminder', message: 'Stand up' });

    const list = listScheduledTasksTool(NOW);
    expect(list).toMatch(/Stretch .*every 1 hr, reminder; next 2026-11-11 11:00/);
    expect(list).toMatch(/Weather brief .*asks UKI: Summarise the weather/);

    expect(cancelScheduledTaskTool({ task: 'nothing' })).toMatch(/^Could not cancel: no scheduled task/);
    expect(cancelScheduledTaskTool({ task: 'stretch' })).toBe('Deleted the scheduled task "Stretch".');
    expect(useScheduledTasksStore.getState().tasks.map((t) => t.title)).toEqual(['Weather brief']);
  });

  it('refuses unreadable times and ambiguous cancels without changing anything', () => {
    expect(scheduleTaskTool({ title: 'x', when: 'someday' }, NOW)).toMatch(/^Could not schedule:/);
    expect(scheduleTaskTool({ title: '', when: 'in 5 minutes' }, NOW)).toMatch(/title is needed/);
    expect(useScheduledTasksStore.getState().tasks).toHaveLength(0);
    scheduleTaskTool({ title: 'Water plants A', when: 'daily at 8am' }, NOW);
    scheduleTaskTool({ title: 'Water plants B', when: 'daily at 6pm' }, NOW);
    expect(cancelScheduledTaskTool({ task: 'water' })).toMatch(/2 tasks match/);
    expect(useScheduledTasksStore.getState().tasks).toHaveLength(2);
  });
});
