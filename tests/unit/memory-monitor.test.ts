// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('MemoryMonitor (useMemoryStore)', () => {
  let store: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const mod = await import('../../src/renderer/services/MemoryMonitor');
    store = mod.useMemoryStore;
    // Reset to fresh state
    store.setState({
      stats: null,
      pressureLevel: 'normal',
      thresholds: { moderate: 0.60, high: 0.80, critical: 0.95 },
      cleanupTasks: [],
      isMonitoring: false,
      lastCleanup: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Stop monitoring if started
    const state = store.getState();
    if (state.isMonitoring) {
      state.stopMonitoring();
    }
  });

  describe('initial state', () => {
    it('starts with null stats', () => {
      expect(store.getState().stats).toBeNull();
    });

    it('starts with normal pressure level', () => {
      expect(store.getState().pressureLevel).toBe('normal');
    });

    it('starts with default thresholds', () => {
      const { thresholds } = store.getState();
      expect(thresholds.moderate).toBe(0.60);
      expect(thresholds.high).toBe(0.80);
      expect(thresholds.critical).toBe(0.95);
    });

    it('starts with empty cleanup tasks', () => {
      expect(store.getState().cleanupTasks).toEqual([]);
    });

    it('starts not monitoring', () => {
      expect(store.getState().isMonitoring).toBe(false);
    });
  });

  describe('updateStats', () => {
    const makeStats = (percentUsed: number) => ({
      heapUsed: percentUsed * 1024 * 1024,
      heapTotal: 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
      percentUsed,
      timestamp: Date.now(),
    });

    it('updates stats in state', () => {
      const stats = makeStats(0.40);
      store.getState().updateStats(stats);
      expect(store.getState().stats).toEqual(stats);
    });

    it('pressure is normal at 40%', () => {
      store.getState().updateStats(makeStats(0.40));
      expect(store.getState().pressureLevel).toBe('normal');
    });

    it('pressure is moderate at 65%', () => {
      store.getState().updateStats(makeStats(0.65));
      expect(store.getState().pressureLevel).toBe('moderate');
    });

    it('pressure is high at 85%', () => {
      store.getState().updateStats(makeStats(0.85));
      expect(store.getState().pressureLevel).toBe('high');
    });

    it('pressure is critical at 97%', () => {
      store.getState().updateStats(makeStats(0.97));
      expect(store.getState().pressureLevel).toBe('critical');
    });

    it('pressure is normal just below moderate threshold', () => {
      store.getState().updateStats(makeStats(0.59));
      expect(store.getState().pressureLevel).toBe('normal');
    });
  });

  describe('setPressureLevel', () => {
    it('sets pressure level directly', () => {
      store.getState().setPressureLevel('high');
      expect(store.getState().pressureLevel).toBe('high');
    });

    it('can set to all valid levels', () => {
      for (const level of ['normal', 'moderate', 'high', 'critical']) {
        store.getState().setPressureLevel(level);
        expect(store.getState().pressureLevel).toBe(level);
      }
    });
  });

  describe('setThresholds', () => {
    it('merges threshold updates', () => {
      store.getState().setThresholds({ moderate: 0.50 });
      const { thresholds } = store.getState();
      expect(thresholds.moderate).toBe(0.50);
      expect(thresholds.high).toBe(0.80); // Unchanged
      expect(thresholds.critical).toBe(0.95); // Unchanged
    });

    it('updates multiple thresholds at once', () => {
      store.getState().setThresholds({ moderate: 0.50, high: 0.70 });
      const { thresholds } = store.getState();
      expect(thresholds.moderate).toBe(0.50);
      expect(thresholds.high).toBe(0.70);
    });
  });

  describe('registerCleanupTask', () => {
    const makeTask = (id: string, priority: number) => ({
      id,
      name: `Task ${id}`,
      priority,
      estimatedSavings: 1024,
      cleanup: vi.fn(),
    });

    it('adds a cleanup task', () => {
      store.getState().registerCleanupTask(makeTask('task-1', 50));
      expect(store.getState().cleanupTasks).toHaveLength(1);
    });

    it('sorts tasks by priority (higher first)', () => {
      store.getState().registerCleanupTask(makeTask('low', 10));
      store.getState().registerCleanupTask(makeTask('high', 90));
      store.getState().registerCleanupTask(makeTask('mid', 50));
      const ids = store.getState().cleanupTasks.map((t: any) => t.id);
      expect(ids[0]).toBe('high');
      expect(ids[1]).toBe('mid');
      expect(ids[2]).toBe('low');
    });

    it('does not add duplicate tasks', () => {
      const task = makeTask('dup-1', 50);
      store.getState().registerCleanupTask(task);
      store.getState().registerCleanupTask(task);
      expect(store.getState().cleanupTasks).toHaveLength(1);
    });
  });

  describe('unregisterCleanupTask', () => {
    it('removes task by id', () => {
      store.getState().registerCleanupTask({ id: 'rm-1', name: 'Test', priority: 50, estimatedSavings: 0, cleanup: vi.fn() });
      store.getState().unregisterCleanupTask('rm-1');
      expect(store.getState().cleanupTasks).toHaveLength(0);
    });

    it('removing non-existent task is a no-op', () => {
      store.getState().registerCleanupTask({ id: 'keep-1', name: 'Keep', priority: 50, estimatedSavings: 0, cleanup: vi.fn() });
      store.getState().unregisterCleanupTask('nonexistent');
      expect(store.getState().cleanupTasks).toHaveLength(1);
    });
  });

  describe('runCleanup', () => {
    it('does not run when pressure is normal (not forced)', async () => {
      const cleanup = vi.fn();
      store.getState().registerCleanupTask({ id: 't1', name: 'T1', priority: 50, estimatedSavings: 0, cleanup });
      store.setState({ pressureLevel: 'normal' });
      await store.getState().runCleanup(false);
      expect(cleanup).not.toHaveBeenCalled();
    });

    it('runs when forced regardless of pressure', async () => {
      const cleanup = vi.fn();
      store.getState().registerCleanupTask({ id: 't2', name: 'T2', priority: 50, estimatedSavings: 0, cleanup });
      store.setState({ pressureLevel: 'normal' });
      await store.getState().runCleanup(true);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it('runs all registered tasks in priority order', async () => {
      const order: string[] = [];
      store.getState().registerCleanupTask({ id: 'low', name: 'Low', priority: 10, estimatedSavings: 0, cleanup: () => order.push('low') });
      store.getState().registerCleanupTask({ id: 'high', name: 'High', priority: 90, estimatedSavings: 0, cleanup: () => order.push('high') });
      store.setState({ pressureLevel: 'high' });
      await store.getState().runCleanup(true);
      expect(order[0]).toBe('high');
      expect(order[1]).toBe('low');
    });

    it('updates lastCleanup timestamp after running', async () => {
      store.setState({ pressureLevel: 'high' });
      const before = Date.now();
      await store.getState().runCleanup(true);
      expect(store.getState().lastCleanup).toBeGreaterThanOrEqual(before);
    });

    it('handles cleanup task errors gracefully', async () => {
      const failingTask = {
        id: 'fail', name: 'Fail', priority: 50, estimatedSavings: 0,
        cleanup: () => { throw new Error('Cleanup failed'); },
      };
      store.getState().registerCleanupTask(failingTask);
      store.setState({ pressureLevel: 'high' });
      await expect(store.getState().runCleanup(true)).resolves.not.toThrow();
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('sets isMonitoring to true', () => {
      store.getState().startMonitoring();
      expect(store.getState().isMonitoring).toBe(true);
    });

    it('sets isMonitoring to false on stop', () => {
      store.getState().startMonitoring();
      store.getState().stopMonitoring();
      expect(store.getState().isMonitoring).toBe(false);
    });

    it('calling startMonitoring twice is a no-op', () => {
      store.getState().startMonitoring();
      store.getState().startMonitoring();
      expect(store.getState().isMonitoring).toBe(true);
    });
  });
});
