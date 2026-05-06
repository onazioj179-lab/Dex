// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX UPDATE ALIAS COMPATIBILITY TESTS
 * ===========================================================================
 *
 * Verifies that ReleaseManager registers both `update:*` (primary) and
 * `updates:*` (backward-compatible alias) IPC channels, and that the
 * old UpdateController cannot accidentally register conflicting handlers.
 *
 * @see src/main/core/ReleaseManager.ts
 * @see src/main/controllers/UpdateController.ts (deprecated)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ===========================================================================
// Track every ipcMain.handle registration
// ===========================================================================

const registeredHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `/mock/${name}`),
    getVersion: vi.fn(() => '2.0.1'),
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      if (registeredHandlers.has(channel)) {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      }
      registeredHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn((channel: string) => {
      registeredHandlers.delete(channel);
    }),
  },
  BrowserWindow: vi.fn(() => ({
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
  })),
  shell: {
    openExternal: vi.fn(() => Promise.resolve()),
  },
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 1 })),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: { file: { level: 'info' } },
  },
}));

vi.mock('electron-store', () => ({
  default: vi.fn(() => ({
    get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    set: vi.fn(),
    delete: vi.fn(),
    path: '/mock/store.json',
  })),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    currentVersion: { version: '2.0.1' },
    setFeedURL: vi.fn(),
  },
}));

// Mock fs/path for ReleaseManager
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => false, mtimeMs: 0 })),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
    promises: {
      readFile: vi.fn(() => Promise.resolve('{}')),
      writeFile: vi.fn(() => Promise.resolve()),
      mkdir: vi.fn(() => Promise.resolve()),
      rm: vi.fn(() => Promise.resolve()),
      readdir: vi.fn(() => Promise.resolve([])),
      stat: vi.fn(() => Promise.resolve({ isDirectory: () => false, mtimeMs: 0 })),
    },
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isDirectory: () => false, mtimeMs: 0 })),
  rmSync: vi.fn(),
  cpSync: vi.fn(),
  promises: {
    readFile: vi.fn(() => Promise.resolve('{}')),
    writeFile: vi.fn(() => Promise.resolve()),
    mkdir: vi.fn(() => Promise.resolve()),
    rm: vi.fn(() => Promise.resolve()),
    readdir: vi.fn(() => Promise.resolve([])),
    stat: vi.fn(() => Promise.resolve({ isDirectory: () => false, mtimeMs: 0 })),
  },
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
    resolve: vi.fn((...args: string[]) => args.join('/')),
    basename: vi.fn((p: string) => p.split('/').pop()),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
  },
  join: vi.fn((...args: string[]) => args.join('/')),
  resolve: vi.fn((...args: string[]) => args.join('/')),
  basename: vi.fn((p: string) => p.split('/').pop()),
  dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')),
}));

vi.mock('os', () => ({
  default: {
    platform: vi.fn(() => 'win32'),
    homedir: vi.fn(() => '/mock/home'),
    tmpdir: vi.fn(() => '/mock/tmp'),
  },
  platform: vi.fn(() => 'win32'),
  homedir: vi.fn(() => '/mock/home'),
  tmpdir: vi.fn(() => '/mock/tmp'),
}));

// ===========================================================================
// Tests
// ===========================================================================

describe('Update System -- Alias Compatibility', () => {
  beforeEach(() => {
    registeredHandlers.clear();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Primary `update:*` channels
  // -------------------------------------------------------------------------

  describe('ReleaseManager primary channels (update:*)', () => {
    const PRIMARY_CHANNELS = [
      'update:getConfig',
      'update:updateConfig',
      'update:getStatus',
      'update:check',
      'update:download',
      'update:install',
      'update:skip',
      'update:listBackups',
      'update:restore',
      'update:rollback',
      'update:deleteBackup',
      'update:getHistory',
    ];

    it('should register all 12 primary update:* channels', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      const manager = new ReleaseManager();
      expect(manager).toBeDefined();

      for (const channel of PRIMARY_CHANNELS) {
        expect(registeredHandlers.has(channel)).toBe(true);
      }
    });

    it('should have a handler function for each primary channel', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      for (const channel of PRIMARY_CHANNELS) {
        const handler = registeredHandlers.get(channel);
        expect(typeof handler).toBe('function');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Backward-compat `updates:*` aliases
  // -------------------------------------------------------------------------

  describe('ReleaseManager alias channels (updates:*)', () => {
    const ALIAS_CHANNELS = [
      'updates:check',
      'updates:download',
      'updates:install',
      'updates:skip',
      'updates:remindLater',
      'updates:getInfo',
      'updates:getPreferences',
      'updates:setPreferences',
      'updates:getRollbackHistory',
      'updates:openReleaseNotes',
      'updates:getChangelog',
      'updates:getReleaseNotesForVersion',
    ];

    it('should register all 12 backward-compat updates:* alias channels', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      for (const channel of ALIAS_CHANNELS) {
        expect(registeredHandlers.has(channel)).toBe(true);
      }
    });

    it('updates:check should return { success, updateAvailable } shape', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const handler = registeredHandlers.get('updates:check');
      expect(handler).toBeDefined();

      // Invoke the handler to verify return shape
      const result = await handler!({} as Electron.IpcMainInvokeEvent);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('updateAvailable');
    });

    it('updates:download should return { success } shape', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const handler = registeredHandlers.get('updates:download');
      const result = await handler!({} as Electron.IpcMainInvokeEvent);
      expect(result).toHaveProperty('success');
    });

    it('updates:install should return { success } shape', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const handler = registeredHandlers.get('updates:install');
      const result = await handler!({} as Electron.IpcMainInvokeEvent);
      expect(result).toHaveProperty('success');
    });

    it('updates:skip should return { success: true }', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const handler = registeredHandlers.get('updates:skip');
      const result = await handler!({} as Electron.IpcMainInvokeEvent);
      expect(result).toEqual({ success: true });
    });

    it('updates:remindLater should return { success: true }', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const handler = registeredHandlers.get('updates:remindLater');
      const result = await handler!({} as Electron.IpcMainInvokeEvent, 24);
      expect(result).toEqual({ success: true });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Old UpdateController is safely deprecated
  // -------------------------------------------------------------------------

  describe('Deprecated UpdateController', () => {
    it('should throw when instantiated', async () => {
      const { UpdateController } = await import('../../src/main/controllers/UpdateController');
      expect(() => new UpdateController()).toThrow(/DEPRECATED/);
    });

    it('should mention ReleaseManager in the error', async () => {
      const { UpdateController } = await import('../../src/main/controllers/UpdateController');
      expect(() => new UpdateController()).toThrow(/ReleaseManager/);
    });

    it('should NOT have a default export (no auto-instantiation)', async () => {
      const mod = await import('../../src/main/controllers/UpdateController') as Record<string, unknown>;
      // The module should not have a default export that creates an instance
      expect(mod.default).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. No handler collisions
  // -------------------------------------------------------------------------

  describe('Handler collision safety', () => {
    it('total registered channels should be exactly 24 (12 primary + 12 aliases)', async () => {
      const { ReleaseManager } = await import('../../src/main/core/ReleaseManager');
      new ReleaseManager();

      const updateChannels = Array.from(registeredHandlers.keys()).filter(
        (ch) => ch.startsWith('update:') || ch.startsWith('updates:')
      );
      expect(updateChannels.length).toBe(24);
    });

    it('should not allow double-registration of the same channel', async () => {
      const { ipcMain } = await import('electron');
      
      // Our mock enforces the same constraint Electron does
      ipcMain.handle('test:unique', () => {});
      expect(() => {
        ipcMain.handle('test:unique', () => {});
      }).toThrow(/second handler/);
    });
  });
});
