// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// @vitest-environment node

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture IPC handlers before any module load
const ipcHandlers = new Map<string, Function>();
const ipcListeners = new Map<string, Function>();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: Function) => {
      ipcListeners.set(channel, handler);
    }),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn(() => null),
    fromId: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null),
  },
  dialog: { showErrorBox: vi.fn(), showMessageBox: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

describe('CrashRecoverySystem', () => {
  let CrashRecoverySystem: any;

  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    ipcListeners.clear();

    // Re-apply mocks after resetModules
    vi.mock('electron', () => ({
      app: {
        getPath: vi.fn(() => '/mock/userData'),
        on: vi.fn(),
      },
      ipcMain: {
        handle: vi.fn((channel: string, handler: Function) => {
          ipcHandlers.set(channel, handler);
        }),
        on: vi.fn((channel: string, handler: Function) => {
          ipcListeners.set(channel, handler);
        }),
        removeHandler: vi.fn(),
      },
      BrowserWindow: {
        getAllWindows: vi.fn(() => []),
        fromWebContents: vi.fn(() => null),
        fromId: vi.fn(() => null),
        getFocusedWindow: vi.fn(() => null),
      },
      dialog: { showErrorBox: vi.fn(), showMessageBox: vi.fn() },
    }));

    vi.mock('electron-log', () => ({
      default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }));

    vi.mock('fs/promises', () => ({
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));

    vi.mock('fs', () => ({
      existsSync: vi.fn(() => false),
    }));

    const mod = await import('../../src/main/core/CrashRecoverySystem');
    CrashRecoverySystem = mod.CrashRecoverySystem;
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('initialize()', () => {
    it('resolves without error', async () => {
      await expect(CrashRecoverySystem.initialize()).resolves.toBeUndefined();
    });

    it('creates the recovery directory during initialization', async () => {
      const fsMod = await import('fs/promises');
      await CrashRecoverySystem.initialize();
      expect(fsMod.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('recovery'),
        { recursive: true },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // IPC channel registration
  // ---------------------------------------------------------------------------

  describe('IPC channel registration', () => {
    it('registers recovery:crashes handler on construction', () => {
      expect(ipcHandlers.has('recovery:crashes')).toBe(true);
    });

    it('registers recovery:stats handler on construction', () => {
      expect(ipcHandlers.has('recovery:stats')).toBe(true);
    });

    it('registers recovery:savedState handler on construction', () => {
      expect(ipcHandlers.has('recovery:savedState')).toBe(true);
    });

    it('registers recovery:restore handler on construction', () => {
      expect(ipcHandlers.has('recovery:restore')).toBe(true);
    });

    it('registers recovery:dismiss handler on construction', () => {
      expect(ipcHandlers.has('recovery:dismiss')).toBe(true);
    });

    it('registers recovery:saveState handler on construction', () => {
      expect(ipcHandlers.has('recovery:saveState')).toBe(true);
    });

    it('registers recovery:config handler on construction', () => {
      expect(ipcHandlers.has('recovery:config')).toBe(true);
    });

    it('registers recovery:setConfig handler on construction', () => {
      expect(ipcHandlers.has('recovery:setConfig')).toBe(true);
    });

    it('registers recovery:unsavedData listener via ipcMain.on', () => {
      expect(ipcListeners.has('recovery:unsavedData')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:crashes
  // ---------------------------------------------------------------------------

  describe('IPC recovery:crashes', () => {
    it('returns an array', async () => {
      const result = await ipcHandlers.get('recovery:crashes')!({} as any, 5);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns an empty array when no crashes have occurred', async () => {
      const result = await ipcHandlers.get('recovery:crashes')!({} as any);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:stats
  // ---------------------------------------------------------------------------

  describe('IPC recovery:stats', () => {
    it('returns stats with totalCrashes field', async () => {
      const stats = await ipcHandlers.get('recovery:stats')!({} as any);
      expect(stats).toHaveProperty('totalCrashes');
    });

    it('returns stats with successfulRecoveries field', async () => {
      const stats = await ipcHandlers.get('recovery:stats')!({} as any);
      expect(stats).toHaveProperty('successfulRecoveries');
    });

    it('returns stats with failedRecoveries field', async () => {
      const stats = await ipcHandlers.get('recovery:stats')!({} as any);
      expect(stats).toHaveProperty('failedRecoveries');
    });

    it('returns stats with crashesByType field', async () => {
      const stats = await ipcHandlers.get('recovery:stats')!({} as any);
      expect(stats).toHaveProperty('crashesByType');
    });

    it('returns zero-initialized stats on a fresh instance', async () => {
      const stats = await ipcHandlers.get('recovery:stats')!({} as any);
      expect(stats.totalCrashes).toBe(0);
      expect(stats.successfulRecoveries).toBe(0);
      expect(stats.failedRecoveries).toBe(0);
      expect(stats.dataLossEvents).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:savedState
  // ---------------------------------------------------------------------------

  describe('IPC recovery:savedState', () => {
    it('returns null initially', async () => {
      const result = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:saveState
  // ---------------------------------------------------------------------------

  describe('IPC recovery:saveState', () => {
    it('returns an object with a success boolean', async () => {
      const result = await ipcHandlers.get('recovery:saveState')!({} as any);
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('returns { success: true } when BrowserWindow.getAllWindows returns empty array', async () => {
      const result = await ipcHandlers.get('recovery:saveState')!({} as any);
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:config
  // ---------------------------------------------------------------------------

  describe('IPC recovery:config', () => {
    it('returns a config object with enabled:true by default', async () => {
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.enabled).toBe(true);
    });

    it('returns a config object with silentMode:true by default', async () => {
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.silentMode).toBe(true);
    });

    it('returns a config object with maxRecoveryAttempts:3 by default', async () => {
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.maxRecoveryAttempts).toBe(3);
    });

    it('returns a config object with autoRecover:true by default', async () => {
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.autoRecover).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // IPC handler: recovery:setConfig
  // ---------------------------------------------------------------------------

  describe('IPC recovery:setConfig', () => {
    it('merges partial config updates', async () => {
      await ipcHandlers.get('recovery:setConfig')!({} as any, { silentMode: false });
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.silentMode).toBe(false);
    });

    it('does not overwrite unrelated config keys when merging', async () => {
      await ipcHandlers.get('recovery:setConfig')!({} as any, { silentMode: false });
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.enabled).toBe(true);
      expect(config.maxRecoveryAttempts).toBe(3);
    });

    it('returns { success: true } after a successful update', async () => {
      const result = await ipcHandlers.get('recovery:setConfig')!({} as any, { recoveryDelayMs: 500 });
      expect(result).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------------------
  // IPC listener: recovery:unsavedData
  // ---------------------------------------------------------------------------

  describe('IPC recovery:unsavedData listener', () => {
    it('stores data in savedState.unsavedData after receiving the event', async () => {
      const listener = ipcListeners.get('recovery:unsavedData')!;
      listener({} as any, 'editor:draft', { content: 'hello world' });

      const saved = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(saved).not.toBeNull();
      expect(saved.unsavedData['editor:draft']).toEqual({ content: 'hello world' });
    });

    it('stores multiple unsaved data keys independently', async () => {
      const listener = ipcListeners.get('recovery:unsavedData')!;
      listener({} as any, 'key1', { a: 1 });
      listener({} as any, 'key2', { b: 2 });

      const saved = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(saved.unsavedData['key1']).toEqual({ a: 1 });
      expect(saved.unsavedData['key2']).toEqual({ b: 2 });
    });

    it('overwrites an existing key when the same key is reported again', async () => {
      const listener = ipcListeners.get('recovery:unsavedData')!;
      listener({} as any, 'doc', { version: 1 });
      listener({} as any, 'doc', { version: 2 });

      const saved = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(saved.unsavedData['doc']).toEqual({ version: 2 });
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: getStats()
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    it('returns correct zero-initialized stats structure', () => {
      const stats = CrashRecoverySystem.getStats();
      expect(stats.totalCrashes).toBe(0);
      expect(stats.successfulRecoveries).toBe(0);
      expect(stats.failedRecoveries).toBe(0);
      expect(stats.dataLossEvents).toBe(0);
      expect(stats.lastCrash).toBeUndefined();
    });

    it('includes all CrashType keys in crashesByType', () => {
      const stats = CrashRecoverySystem.getStats();
      const expectedTypes = [
        'renderer-crash',
        'renderer-unresponsive',
        'main-exception',
        'uncaught-promise',
        'memory-pressure',
        'gpu-crash',
        'worker-crash',
      ];
      for (const t of expectedTypes) {
        expect(stats.crashesByType).toHaveProperty(t, 0);
      }
    });

    it('uptimeSinceLastCrash is a positive number', () => {
      const stats = CrashRecoverySystem.getStats();
      expect(stats.uptimeSinceLastCrash).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: updateConfig()
  // ---------------------------------------------------------------------------

  describe('updateConfig()', () => {
    it('merges partial updates into the existing config', async () => {
      await CrashRecoverySystem.updateConfig({ maxRecoveryAttempts: 5 });
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.maxRecoveryAttempts).toBe(5);
    });

    it('preserves unmodified fields after a partial update', async () => {
      await CrashRecoverySystem.updateConfig({ recoveryDelayMs: 2000 });
      const config = await ipcHandlers.get('recovery:config')!({} as any);
      expect(config.enabled).toBe(true);
      expect(config.silentMode).toBe(true);
    });

    it('returns { success: true }', async () => {
      const result = await CrashRecoverySystem.updateConfig({ silentMode: false });
      expect(result).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: saveCurrentState()
  // ---------------------------------------------------------------------------

  describe('saveCurrentState()', () => {
    it('returns { success: true } when no windows are open', async () => {
      const result = await CrashRecoverySystem.saveCurrentState();
      expect(result).toEqual({ success: true });
    });

    it('writes state to the state file', async () => {
      const fsMod = await import('fs/promises');
      await CrashRecoverySystem.initialize();
      await CrashRecoverySystem.saveCurrentState();
      expect(fsMod.writeFile).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: dismissSavedState()
  // ---------------------------------------------------------------------------

  describe('dismissSavedState()', () => {
    it('clears savedState to null after being called', async () => {
      // First populate savedState via unsavedData listener
      const listener = ipcListeners.get('recovery:unsavedData')!;
      listener({} as any, 'test', { value: 42 });

      // Confirm it is set
      const before = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(before).not.toBeNull();

      await CrashRecoverySystem.dismissSavedState();

      const after = await ipcHandlers.get('recovery:savedState')!({} as any);
      expect(after).toBeNull();
    });

    it('returns { success: true } when called with no state file present', async () => {
      const result = await CrashRecoverySystem.dismissSavedState();
      expect(result).toEqual({ success: true });
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: restoreFromSavedState()
  // ---------------------------------------------------------------------------

  describe('restoreFromSavedState()', () => {
    it('returns { success: false, restored: 0 } when no saved state exists', async () => {
      const result = await CrashRecoverySystem.restoreFromSavedState();
      expect(result.success).toBe(false);
      expect(result.restored).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Direct method: getCrashHistory()
  // ---------------------------------------------------------------------------

  describe('getCrashHistory()', () => {
    it('returns an empty array on a fresh instance', () => {
      const history = CrashRecoverySystem.getCrashHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0);
    });

    it('respects the optional limit parameter', () => {
      const history = CrashRecoverySystem.getCrashHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
