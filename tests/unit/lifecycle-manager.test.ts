// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// @vitest-environment jsdom

/**
 * ===========================================================================
 * LIFECYCLE MANAGER TESTS
 * ===========================================================================
 *
 * Unit tests for useLifecycleManager (Zustand store):
 * - Process creation and initial state
 * - Lifecycle transitions: launch, foreground, background, suspend, resume, terminate
 * - Crash handling and recovery
 * - Functional state management
 * - State preservation / restoration / clearing
 * - Navigation stack (navigate, goBack, goForward, canGoBack, canGoForward)
 * - Window management (bounds, minimized, maximized)
 * - Memory pressure handling
 * - Query helpers (getProcess, getForegroundProcess, getProcessesByApp, etc.)
 * ===========================================================================
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock SystemServices BEFORE importing LifecycleManager
// ---------------------------------------------------------------------------

const mockAllocateBudget = vi.fn((_appId: string, instanceId: string) => ({
  appId: _appId,
  instanceId,
  cpuPercent: 25,
  memoryMB: 256,
  networkKBps: 1024,
  ioOpsPerSec: 100,
  cpuUsed: 0,
  memoryUsed: 0,
  networkUsed: 0,
  ioOpsUsed: 0,
  lastUpdated: Date.now(),
  throttled: false,
  violations: 0,
}));

const mockReleaseBudget = vi.fn();

const mockEmit = vi.fn();

vi.mock('../../src/renderer/services/SystemServices', () => ({
  usePowerService: {
    getState: () => ({
      allocateBudget: mockAllocateBudget,
      releaseBudget: mockReleaseBudget,
    }),
  },
  useSystemEvents: {
    getState: () => ({
      emit: mockEmit,
    }),
  },
}));

// Mock zustand's persist middleware to be a no-op so tests are isolated
vi.mock('zustand/middleware', () => ({
  persist: (fn: unknown) => fn,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { useLifecycleManager } from '../../src/renderer/services/LifecycleManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshStore() {
  // Reset the store to a clean baseline between tests
  useLifecycleManager.setState({
    processes: new Map(),
    foregroundProcessId: null,
    backgroundProcessIds: new Set(),
    suspendedProcessIds: new Set(),
    memoryPressure: 'normal',
    maxProcesses: 20,
    transitions: [],
  });
}

function getStore() {
  return useLifecycleManager.getState();
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('LifecycleManager – createProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('creates a process with correct initial shape', () => {
    const store = getStore();
    const proc = store.createProcess('notes');

    expect(proc.appId).toBe('notes');
    expect(proc.lifecycleState).toBe('initial');
    expect(proc.functionalState).toBe('initial');
    expect(proc.launchedAt).toBeNull();
    expect(proc.terminatedAt).toBeNull();
    expect(proc.suspendedAt).toBeNull();
    expect(proc.crashCount).toBe(0);
    expect(proc.lastError).toBeNull();
    expect(proc.resourceBudgetId).toBeNull();
    expect(proc.navigationStack).toEqual(['/']);
    expect(proc.currentRoute).toBe('/');
    expect(proc.navigationIndex).toBe(0);
  });

  it('uses a custom initial route when provided', () => {
    const proc = getStore().createProcess('browser', '/settings');
    expect(proc.currentRoute).toBe('/settings');
    expect(proc.navigationStack).toEqual(['/settings']);
  });

  it('registers the process in the store', () => {
    const proc = getStore().createProcess('files');
    const found = getStore().processes.get(proc.instanceId);
    expect(found).toBeDefined();
    expect(found!.instanceId).toBe(proc.instanceId);
  });

  it('emits an app_launch event on creation', () => {
    getStore().createProcess('music');
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app_launch', data: { state: 'created' } })
    );
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – launchProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('returns false for an unknown instanceId', async () => {
    const result = await getStore().launchProcess('does-not-exist');
    expect(result).toBe(false);
  });

  it('transitions to foreground and sets launchedAt', async () => {
    const proc = getStore().createProcess('calendar');
    const result = await getStore().launchProcess(proc.instanceId);

    expect(result).toBe(true);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('foreground');
    expect(updated.functionalState).toBe('active');
    expect(updated.launchedAt).toBeGreaterThan(0);
  });

  it('sets the launched process as foreground', async () => {
    const proc = getStore().createProcess('maps');
    await getStore().launchProcess(proc.instanceId);
    expect(getStore().foregroundProcessId).toBe(proc.instanceId);
  });

  it('allocates a resource budget on launch', async () => {
    const proc = getStore().createProcess('editor');
    await getStore().launchProcess(proc.instanceId);
    expect(mockAllocateBudget).toHaveBeenCalledWith('editor', proc.instanceId);
  });

  it('sends the previous foreground process to background on launch', async () => {
    const first = getStore().createProcess('app-a');
    await getStore().launchProcess(first.instanceId);

    const second = getStore().createProcess('app-b');
    await getStore().launchProcess(second.instanceId);

    const firstProc = getStore().processes.get(first.instanceId)!;
    expect(firstProc.lifecycleState).toBe('background');
    expect(getStore().foregroundProcessId).toBe(second.instanceId);
  });

  it('records a lifecycle transition', async () => {
    const proc = getStore().createProcess('chat');
    await getStore().launchProcess(proc.instanceId);
    const transitions = getStore().transitions;
    expect(transitions.length).toBeGreaterThan(0);
    const last = transitions[transitions.length - 1];
    expect(last.instanceId).toBe(proc.instanceId);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – foregroundProcess / backgroundProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('backgroundProcess sets lifecycle and functional state to background', async () => {
    const proc = getStore().createProcess('tasks');
    await getStore().launchProcess(proc.instanceId);
    getStore().backgroundProcess(proc.instanceId);

    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('background');
    expect(updated.functionalState).toBe('background');
  });

  it('backgroundProcess removes process from foreground slot', async () => {
    const proc = getStore().createProcess('tasks');
    await getStore().launchProcess(proc.instanceId);
    getStore().backgroundProcess(proc.instanceId);

    expect(getStore().foregroundProcessId).toBeNull();
    expect(getStore().backgroundProcessIds.has(proc.instanceId)).toBe(true);
  });

  it('foregroundProcess resumes a suspended process', async () => {
    const proc = getStore().createProcess('reader');
    await getStore().launchProcess(proc.instanceId);
    getStore().suspendProcess(proc.instanceId);

    getStore().foregroundProcess(proc.instanceId);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('foreground');
    expect(updated.suspendedAt).toBeNull();
  });

  it('foregroundProcess does nothing for a terminated process', async () => {
    const proc = getStore().createProcess('dead');
    await getStore().launchProcess(proc.instanceId);
    getStore().terminateProcess(proc.instanceId);
    // After termination the process is removed from map; call should not throw
    expect(() => getStore().foregroundProcess(proc.instanceId)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – suspendProcess / resumeProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('suspendProcess transitions to suspended state and records suspendedAt', async () => {
    const proc = getStore().createProcess('gallery');
    await getStore().launchProcess(proc.instanceId);
    getStore().backgroundProcess(proc.instanceId);
    getStore().suspendProcess(proc.instanceId);

    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('suspended');
    expect(updated.functionalState).toBe('suspended');
    expect(updated.suspendedAt).toBeGreaterThan(0);
    expect(updated.resourceBudgetId).toBeNull();
  });

  it('suspendProcess releases the resource budget', async () => {
    const proc = getStore().createProcess('pdf');
    await getStore().launchProcess(proc.instanceId);
    mockReleaseBudget.mockClear();
    getStore().suspendProcess(proc.instanceId);
    expect(mockReleaseBudget).toHaveBeenCalledWith(proc.instanceId);
  });

  it('suspendProcess adds to suspendedProcessIds', async () => {
    const proc = getStore().createProcess('notes');
    await getStore().launchProcess(proc.instanceId);
    getStore().suspendProcess(proc.instanceId);
    expect(getStore().suspendedProcessIds.has(proc.instanceId)).toBe(true);
  });

  it('resumeProcess moves suspended process to background', async () => {
    const proc = getStore().createProcess('stats');
    await getStore().launchProcess(proc.instanceId);
    getStore().suspendProcess(proc.instanceId);
    getStore().resumeProcess(proc.instanceId);

    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('background');
    expect(updated.suspendedAt).toBeNull();
    expect(getStore().backgroundProcessIds.has(proc.instanceId)).toBe(true);
    expect(getStore().suspendedProcessIds.has(proc.instanceId)).toBe(false);
  });

  it('resumeProcess re-allocates a budget', async () => {
    const proc = getStore().createProcess('weather');
    await getStore().launchProcess(proc.instanceId);
    getStore().suspendProcess(proc.instanceId);
    mockAllocateBudget.mockClear();
    getStore().resumeProcess(proc.instanceId);
    expect(mockAllocateBudget).toHaveBeenCalledWith('weather', proc.instanceId);
  });

  it('resumeProcess is a no-op for a non-suspended process', async () => {
    const proc = getStore().createProcess('clock');
    await getStore().launchProcess(proc.instanceId);
    // In foreground – not suspended
    expect(() => getStore().resumeProcess(proc.instanceId)).not.toThrow();
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.lifecycleState).toBe('foreground');
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – terminateProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('removes process from the store after termination', async () => {
    const proc = getStore().createProcess('todo');
    await getStore().launchProcess(proc.instanceId);
    getStore().terminateProcess(proc.instanceId);
    expect(getStore().processes.has(proc.instanceId)).toBe(false);
  });

  it('releases the resource budget on termination', async () => {
    const proc = getStore().createProcess('mail');
    await getStore().launchProcess(proc.instanceId);
    mockReleaseBudget.mockClear();
    getStore().terminateProcess(proc.instanceId);
    expect(mockReleaseBudget).toHaveBeenCalledWith(proc.instanceId);
  });

  it('promotes another process to foreground when the foreground is terminated', async () => {
    const a = getStore().createProcess('app-a');
    await getStore().launchProcess(a.instanceId);
    const b = getStore().createProcess('app-b');
    await getStore().launchProcess(b.instanceId);

    // b is now foreground; terminate b – a should become foreground
    getStore().terminateProcess(b.instanceId);
    expect(getStore().foregroundProcessId).toBe(a.instanceId);
  });

  it('emits an app_close event', async () => {
    const proc = getStore().createProcess('logs');
    await getStore().launchProcess(proc.instanceId);
    mockEmit.mockClear();
    getStore().terminateProcess(proc.instanceId, 'Test reason');
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'app_close', data: { reason: 'Test reason' } })
    );
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – handleCrash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  const recoverableError = {
    code: 'RENDER_ERR',
    message: 'Render failed',
    timestamp: Date.now(),
    recoverable: true,
  };

  const fatalError = {
    code: 'FATAL',
    message: 'Out of memory',
    timestamp: Date.now(),
    recoverable: false,
  };

  it('increments crashCount and sets lastError', async () => {
    const proc = getStore().createProcess('graph');
    await getStore().launchProcess(proc.instanceId);
    getStore().handleCrash(proc.instanceId, recoverableError);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.crashCount).toBe(1);
    expect(updated.lastError).toEqual(recoverableError);
  });

  it('enters error functional state for first recoverable crash', async () => {
    const proc = getStore().createProcess('chart');
    await getStore().launchProcess(proc.instanceId);
    getStore().handleCrash(proc.instanceId, recoverableError);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.functionalState).toBe('error');
  });

  it('terminates after 3 crashes', async () => {
    const proc = getStore().createProcess('flaky');
    await getStore().launchProcess(proc.instanceId);
    getStore().handleCrash(proc.instanceId, recoverableError);
    getStore().handleCrash(proc.instanceId, recoverableError);
    // Third crash should trigger termination
    getStore().handleCrash(proc.instanceId, recoverableError);
    expect(getStore().processes.has(proc.instanceId)).toBe(false);
  });

  it('terminates immediately on a non-recoverable crash', async () => {
    const proc = getStore().createProcess('critical');
    await getStore().launchProcess(proc.instanceId);
    getStore().handleCrash(proc.instanceId, fatalError);
    expect(getStore().processes.has(proc.instanceId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – state preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('preserveState merges state and bumps stateVersion', () => {
    const proc = getStore().createProcess('notes');
    getStore().preserveState(proc.instanceId, { scroll: 42 });
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.preservedState).toMatchObject({ scroll: 42 });
    expect(updated.stateVersion).toBe(1);
  });

  it('restoreState returns the preserved data', () => {
    const proc = getStore().createProcess('notes');
    getStore().preserveState(proc.instanceId, { tab: 'home' });
    const restored = getStore().restoreState(proc.instanceId);
    expect(restored).toMatchObject({ tab: 'home' });
  });

  it('clearPreservedState resets state and version to zero', () => {
    const proc = getStore().createProcess('notes');
    getStore().preserveState(proc.instanceId, { x: 1 });
    getStore().clearPreservedState(proc.instanceId);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.preservedState).toEqual({});
    expect(updated.stateVersion).toBe(0);
  });

  it('restoreState returns null for an unknown instanceId', () => {
    expect(getStore().restoreState('no-such-id')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('navigate pushes a new route onto the stack', () => {
    const proc = getStore().createProcess('browser');
    getStore().navigate(proc.instanceId, '/about');
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.currentRoute).toBe('/about');
    expect(updated.navigationStack).toEqual(['/', '/about']);
    expect(updated.navigationIndex).toBe(1);
  });

  it('goBack returns false when at the beginning of the stack', () => {
    const proc = getStore().createProcess('browser');
    expect(getStore().goBack(proc.instanceId)).toBe(false);
  });

  it('goBack moves the index backwards', () => {
    const proc = getStore().createProcess('browser');
    getStore().navigate(proc.instanceId, '/page1');
    getStore().navigate(proc.instanceId, '/page2');
    const moved = getStore().goBack(proc.instanceId);
    expect(moved).toBe(true);
    expect(getStore().processes.get(proc.instanceId)!.currentRoute).toBe('/page1');
  });

  it('goForward returns false when at the end of the stack', () => {
    const proc = getStore().createProcess('browser');
    expect(getStore().goForward(proc.instanceId)).toBe(false);
  });

  it('goForward moves the index forwards', () => {
    const proc = getStore().createProcess('browser');
    getStore().navigate(proc.instanceId, '/page1');
    getStore().goBack(proc.instanceId);
    const moved = getStore().goForward(proc.instanceId);
    expect(moved).toBe(true);
    expect(getStore().processes.get(proc.instanceId)!.currentRoute).toBe('/page1');
  });

  it('canGoBack reflects navigation index correctly', () => {
    const proc = getStore().createProcess('browser');
    expect(getStore().canGoBack(proc.instanceId)).toBe(false);
    getStore().navigate(proc.instanceId, '/x');
    expect(getStore().canGoBack(proc.instanceId)).toBe(true);
  });

  it('canGoForward reflects navigation index correctly', () => {
    const proc = getStore().createProcess('browser');
    getStore().navigate(proc.instanceId, '/x');
    getStore().goBack(proc.instanceId);
    expect(getStore().canGoForward(proc.instanceId)).toBe(true);
  });

  it('navigate after goBack truncates forward history', () => {
    const proc = getStore().createProcess('browser');
    getStore().navigate(proc.instanceId, '/a');
    getStore().navigate(proc.instanceId, '/b');
    getStore().goBack(proc.instanceId);
    getStore().navigate(proc.instanceId, '/c');
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.navigationStack).toEqual(['/', '/a', '/c']);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – window management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('updateWindowBounds persists the bounds', () => {
    const proc = getStore().createProcess('app');
    const bounds = { x: 10, y: 20, width: 800, height: 600 };
    getStore().updateWindowBounds(proc.instanceId, bounds);
    expect(getStore().processes.get(proc.instanceId)!.windowBounds).toEqual(bounds);
  });

  it('setMinimized true also sends the process to background', async () => {
    const proc = getStore().createProcess('app');
    await getStore().launchProcess(proc.instanceId);
    getStore().setMinimized(proc.instanceId, true);
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.isMinimized).toBe(true);
    expect(updated.lifecycleState).toBe('background');
  });

  it('setMinimized false only updates the flag', async () => {
    const proc = getStore().createProcess('app');
    await getStore().launchProcess(proc.instanceId);
    getStore().setMinimized(proc.instanceId, false);
    expect(getStore().processes.get(proc.instanceId)!.isMinimized).toBe(false);
  });

  it('setMaximized updates the flag', async () => {
    const proc = getStore().createProcess('app');
    await getStore().launchProcess(proc.instanceId);
    getStore().setMaximized(proc.instanceId, true);
    expect(getStore().processes.get(proc.instanceId)!.isMaximized).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – memory pressure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('setMemoryPressure updates the memoryPressure value', () => {
    getStore().setMemoryPressure('moderate');
    expect(getStore().memoryPressure).toBe('moderate');
  });

  it('critical pressure triggers handleMemoryPressure and suspends background processes', async () => {
    const a = getStore().createProcess('bg-a');
    await getStore().launchProcess(a.instanceId);
    const b = getStore().createProcess('bg-b');
    await getStore().launchProcess(b.instanceId);
    // a is now in background
    getStore().setMemoryPressure('critical');
    // At least one background process should be suspended
    expect(getStore().suspendedProcessIds.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('getProcess returns undefined for unknown id', () => {
    expect(getStore().getProcess('nope')).toBeUndefined();
  });

  it('getForegroundProcess returns the foreground process', async () => {
    const proc = getStore().createProcess('dash');
    await getStore().launchProcess(proc.instanceId);
    const fg = getStore().getForegroundProcess();
    expect(fg?.instanceId).toBe(proc.instanceId);
  });

  it('getForegroundProcess returns undefined when none is in foreground', () => {
    expect(getStore().getForegroundProcess()).toBeUndefined();
  });

  it('getProcessesByApp returns only processes matching that appId', async () => {
    const a1 = getStore().createProcess('chat');
    const a2 = getStore().createProcess('chat');
    getStore().createProcess('email');
    const chatProcs = getStore().getProcessesByApp('chat');
    const ids = chatProcs.map(p => p.instanceId);
    expect(ids).toContain(a1.instanceId);
    expect(ids).toContain(a2.instanceId);
    expect(chatProcs.every(p => p.appId === 'chat')).toBe(true);
  });

  it('getActiveProcesses excludes terminated processes', async () => {
    const alive = getStore().createProcess('keeper');
    const dead = getStore().createProcess('goner');
    await getStore().launchProcess(alive.instanceId);
    await getStore().launchProcess(dead.instanceId);
    getStore().terminateProcess(dead.instanceId);
    const active = getStore().getActiveProcesses();
    expect(active.some(p => p.instanceId === alive.instanceId)).toBe(true);
    expect(active.some(p => p.instanceId === dead.instanceId)).toBe(false);
  });

  it('getProcessCount counts only active (non-terminated) processes', async () => {
    const a = getStore().createProcess('x');
    const b = getStore().createProcess('y');
    await getStore().launchProcess(a.instanceId);
    await getStore().launchProcess(b.instanceId);
    getStore().terminateProcess(b.instanceId);
    expect(getStore().getProcessCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('LifecycleManager – setFunctionalState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freshStore();
  });

  it('updates only the functionalState field', async () => {
    const proc = getStore().createProcess('widget');
    await getStore().launchProcess(proc.instanceId);
    getStore().setFunctionalState(proc.instanceId, 'offline');
    const updated = getStore().processes.get(proc.instanceId)!;
    expect(updated.functionalState).toBe('offline');
    // Lifecycle state must remain unchanged
    expect(updated.lifecycleState).toBe('foreground');
  });

  it('is a no-op for an unknown instanceId', () => {
    expect(() => getStore().setFunctionalState('ghost', 'error')).not.toThrow();
  });
});
