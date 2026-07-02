// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the scheduled-tasks store: interval clamping, next-run
 * initialization on add, enable/disable rescheduling, and removal.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useScheduledTasksStore, MIN_INTERVAL_MS } from '../../src/renderer/store/scheduledTasksStore';

const NOW = new Date(2026, 6, 2, 10, 30, 0, 0).getTime();

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom */ }
  useScheduledTasksStore.setState({ tasks: [] });
});

describe('scheduledTasksStore', () => {
  it('adds an interval task, clamps to the minimum, and schedules next run', () => {
    const id = useScheduledTasksStore.getState().addTask({
      title: 'Ping', kind: 'interval', intervalMs: 1000, // below minimum
      action: { type: 'reminder', message: 'ping' },
    }, NOW);
    const t = useScheduledTasksStore.getState().tasks.find(x => x.id === id)!;
    expect(t.intervalMs).toBe(MIN_INTERVAL_MS);
    expect(t.nextRunAt).toBe(NOW + MIN_INTERVAL_MS);
    expect(t.enabled).toBe(true);
    expect(t.maxAttempts).toBe(3);
  });

  it('adds a cron task and computes its next run', () => {
    const id = useScheduledTasksStore.getState().addTask({
      title: 'Morning', kind: 'cron', cron: '0 11 * * *',
      action: { type: 'reminder' },
    }, NOW);
    const t = useScheduledTasksStore.getState().tasks.find(x => x.id === id)!;
    expect(t.kind).toBe('cron');
    expect(t.nextRunAt).not.toBeNull();
    expect(new Date(t.nextRunAt!).getHours()).toBe(11);
  });

  it('setEnabled(false) clears next run; re-enabling reschedules', () => {
    const store = useScheduledTasksStore.getState();
    const id = store.addTask({ title: 'X', kind: 'interval', intervalMs: MIN_INTERVAL_MS, action: { type: 'reminder' } }, NOW);
    store.setEnabled(id, false, NOW);
    expect(useScheduledTasksStore.getState().tasks[0].nextRunAt).toBeNull();
    store.setEnabled(id, true, NOW + 5000);
    expect(useScheduledTasksStore.getState().tasks[0].nextRunAt).toBe(NOW + 5000 + MIN_INTERVAL_MS);
  });

  it('removes a task', () => {
    const store = useScheduledTasksStore.getState();
    const id = store.addTask({ title: 'Y', kind: 'interval', intervalMs: MIN_INTERVAL_MS, action: { type: 'reminder' } }, NOW);
    expect(useScheduledTasksStore.getState().tasks).toHaveLength(1);
    store.removeTask(id);
    expect(useScheduledTasksStore.getState().tasks).toHaveLength(0);
  });

  it('newest task is first and persists to localStorage', () => {
    const store = useScheduledTasksStore.getState();
    store.addTask({ title: 'First', kind: 'interval', intervalMs: MIN_INTERVAL_MS, action: { type: 'reminder' } }, NOW);
    store.addTask({ title: 'Second', kind: 'interval', intervalMs: MIN_INTERVAL_MS, action: { type: 'reminder' } }, NOW + 1000);
    expect(useScheduledTasksStore.getState().tasks[0].title).toBe('Second');
    const raw = localStorage.getItem('dex-scheduled-tasks');
    expect(raw && JSON.parse(raw).length).toBe(2);
  });
});
