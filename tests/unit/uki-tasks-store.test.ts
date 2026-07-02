// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the UKI background-task ledger (ukiTasksStore):
 * lifecycle (start -> steps -> done/failed), the stall watchdog sweep,
 * eviction of finished tasks past the cap, and the crash-honesty rule
 * (interrupted tasks rehydrate as failed, never resurrected as running).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStorage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key: string) => mockStorage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
  },
  writable: true,
});

vi.mock('../../src/renderer/services/notify', () => ({
  notify: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../src/renderer/services/SharedTick', () => ({
  sharedTick: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

describe('useUkiTasks', () => {
  let store: any;

  beforeEach(async () => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.resetModules();
    const mod = await import('../../src/renderer/store/ukiTasksStore');
    store = mod.useUkiTasks;
    store.setState({ tasks: [] });
  });

  it('tracks a full task lifecycle', () => {
    const id = store.getState().startTask('Research: latest release', 'uki-agent');
    let task = store.getState().tasks.find((t: any) => t.id === id);
    expect(task.status).toBe('running');

    store.getState().logTaskStep(id, 'Tool: web_search');
    store.getState().completeTask(id, 'Found it.');
    task = store.getState().tasks.find((t: any) => t.id === id);
    expect(task.status).toBe('done');
    expect(task.result).toBe('Found it.');
    expect(task.steps).toHaveLength(1);
    expect(task.finishedAt).toBeGreaterThan(0);
  });

  it('fails a task with an error message', () => {
    const id = store.getState().startTask('Broken run', 'uki-agent');
    store.getState().failTask(id, 'Provider unavailable');
    const task = store.getState().tasks.find((t: any) => t.id === id);
    expect(task.status).toBe('failed');
    expect(task.error).toBe('Provider unavailable');
  });

  it('sweep flags silent running tasks as stalled, and a new step revives them', () => {
    const id = store.getState().startTask('Long run', 'uki-agent');
    // Backdate the task's last update past the stall window
    store.setState({
      tasks: store.getState().tasks.map((t: any) =>
        t.id === id ? { ...t, updatedAt: Date.now() - 10 * 60 * 1000 } : t),
    });
    store.getState().sweep();
    expect(store.getState().tasks.find((t: any) => t.id === id).status).toBe('stalled');

    store.getState().logTaskStep(id, 'Still working');
    expect(store.getState().tasks.find((t: any) => t.id === id).status).toBe('running');
  });

  it('sweep leaves fresh running tasks alone', () => {
    const id = store.getState().startTask('Fresh run', 'uki-agent');
    store.getState().sweep();
    expect(store.getState().tasks.find((t: any) => t.id === id).status).toBe('running');
  });

  it('clearFinished removes done/failed but keeps active tasks', () => {
    const a = store.getState().startTask('A', 'uki-agent');
    const b = store.getState().startTask('B', 'uki-agent');
    store.getState().completeTask(a);
    store.getState().clearFinished();
    const ids = store.getState().tasks.map((t: any) => t.id);
    expect(ids).toEqual([b]);
  });

  it('evicts oldest finished tasks past the cap, never active ones', () => {
    for (let i = 0; i < 60; i++) {
      const id = store.getState().startTask(`T${i}`, 'uki-agent');
      if (i < 55) store.getState().completeTask(id);
    }
    const tasks = store.getState().tasks;
    expect(tasks.length).toBeLessThanOrEqual(50);
    // All 5 still-running tasks survived eviction
    expect(tasks.filter((t: any) => t.status === 'running')).toHaveLength(5);
  });

  it('rehydrates interrupted tasks as failed (crash honesty)', async () => {
    const id = store.getState().startTask('Interrupted work', 'uki-agent');
    store.getState().logTaskStep(id, 'Tool: web_search');
    // Simulate app restart: fresh module import rehydrates from storage
    vi.resetModules();
    const mod = await import('../../src/renderer/store/ukiTasksStore');
    const task = mod.useUkiTasks.getState().tasks.find((t: any) => t.id === id);
    expect(task).toBeDefined();
    expect(task!.status).toBe('failed');
    expect(task!.error).toBe('Interrupted by app restart');
  });
});
