// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 *
 * Note on better-sqlite3:
 * The native better-sqlite3 addon cannot be loaded in this Vitest/Node
 * environment (version mismatch). DatabaseManager gracefully degrades to
 * no-persistence mode when the native module is unavailable.
 *
 * Tests that require a live database object inject a lightweight in-memory
 * stub directly into the manager's private `db` field (using the escape
 * hatch `(manager as any).db = stubDb`) and call relevant methods to verify
 * the delegation contracts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

// =============================================================================
// Module import
// =============================================================================

import { DatabaseManager } from '../../src/main/core/DatabaseManager';

// =============================================================================
// In-memory SQLite stub – injected directly into the manager
// =============================================================================

const mem: Record<string, string> = {};

function makeStubDb() {
  return {
    pragma: vi.fn((p: string) => {
      if (p === 'journal_mode = WAL') return [{ journal_mode: 'wal' }];
      if (p === 'foreign_keys') return [{ foreign_keys: 1 }];
      if (p === 'quick_check') return [{ quick_check: 'ok' }];
      return [];
    }),
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => ({
      get: vi.fn((key?: string) => {
        if (sql.includes('SELECT value FROM settings WHERE key')) {
          return mem[key!] !== undefined ? { value: mem[key!] } : undefined;
        }
        return undefined;
      }),
      run: vi.fn((key?: string, value?: string) => {
        if (sql.includes('INSERT INTO settings') && key !== undefined && value !== undefined) {
          mem[key] = value;
        }
      }),
    })),
    transaction: vi.fn((fn: Function) => () => fn()),
    close: vi.fn(),
  };
}

// Helper: create a manager and inject a live stub db into it
function makeManagerWithDb() {
  const manager = new DatabaseManager();
  const stubDb = makeStubDb();
  (manager as any).db = stubDb;
  (manager as any).initialized = true;
  return { manager, stubDb };
}

// =============================================================================
// Tests
// =============================================================================

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(async () => {
    Object.keys(mem).forEach(k => delete mem[k]);

    const fsMod = await import('fs');
    vi.mocked(fsMod.existsSync).mockReturnValue(false);
    vi.mocked(fsMod.mkdirSync).mockClear();

    manager = new DatabaseManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor / directory creation
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('constructs without throwing', () => {
      expect(manager).toBeDefined();
    });

    it('creates the databases directory when it does not exist', async () => {
      const fsMod = await import('fs');
      expect(vi.mocked(fsMod.mkdirSync)).toHaveBeenCalledWith(
        expect.stringContaining('databases'),
        { recursive: true }
      );
    });

    it('skips mkdirSync when the directory already exists', async () => {
      const fsMod = await import('fs');
      vi.mocked(fsMod.existsSync).mockReturnValue(true);
      vi.mocked(fsMod.mkdirSync).mockClear();
      new DatabaseManager();
      expect(vi.mocked(fsMod.mkdirSync)).not.toHaveBeenCalled();
    });

    it('calls app.getPath("userData") to locate user data', async () => {
      const { app } = await import('electron');
      expect(vi.mocked(app.getPath)).toHaveBeenCalledWith('userData');
    });

    it('derives the db path inside the databases sub-directory', async () => {
      // dbPath is private but we verify the mkdirSync target contains 'databases'
      const fsMod = await import('fs');
      const call = vi.mocked(fsMod.mkdirSync).mock.calls[0];
      expect(call[0]).toContain('databases');
    });
  });

  // -------------------------------------------------------------------------
  // initialize() – graceful-degradation path (native module unavailable)
  // -------------------------------------------------------------------------

  describe('initialize() – graceful degradation', () => {
    it('does not throw even when better-sqlite3 is unavailable', () => {
      expect(() => manager.initialize()).not.toThrow();
    });

    it('marks itself initialized (no retries)', () => {
      manager.initialize();
      // initialized private flag is true; isReady() is false because db is null
      expect((manager as any).initialized).toBe(true);
    });

    it('is idempotent – calling initialize() twice is safe', () => {
      manager.initialize();
      expect(() => manager.initialize()).not.toThrow();
    });

    it('logs a warning when SQLite is unavailable', async () => {
      const log = await import('electron-log');
      manager.initialize();
      // Either the top-level require fail or initialize() warn path fires
      const warned = vi.mocked((log as any).warn).mock.calls.length > 0 ||
        vi.mocked((log as any).default?.warn).mock.calls.length > 0;
      expect(warned).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // isReady()
  // -------------------------------------------------------------------------

  describe('isReady()', () => {
    it('returns false before initialization', () => {
      expect(manager.isReady()).toBe(false);
    });

    it('returns false after graceful-degradation initialization (no native db)', () => {
      manager.initialize();
      expect(manager.isReady()).toBe(false);
    });

    it('returns true when db stub is injected directly', () => {
      const { manager: m } = makeManagerWithDb();
      expect(m.isReady()).toBe(true);
    });

    it('returns false after close()', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(m.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDatabase()
  // -------------------------------------------------------------------------

  describe('getDatabase()', () => {
    it('returns null before initialization', () => {
      expect(manager.getDatabase()).toBeNull();
    });

    it('returns null after graceful-degradation initialization', () => {
      manager.initialize();
      expect(manager.getDatabase()).toBeNull();
    });

    it('returns the injected stub when db is set directly', () => {
      const { manager: m, stubDb } = makeManagerWithDb();
      expect(m.getDatabase()).toBe(stubDb);
    });

    it('returns null after close()', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(m.getDatabase()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getSetting()
  // -------------------------------------------------------------------------

  describe('getSetting()', () => {
    it('returns the defaultValue when db is null', () => {
      expect(manager.getSetting('any-key', 'fallback')).toBe('fallback');
    });

    it('returns empty string as default when defaultValue is omitted and db is null', () => {
      expect(manager.getSetting('any-key')).toBe('');
    });

    it('returns the defaultValue when key is absent in the db', () => {
      const { manager: m } = makeManagerWithDb();
      expect(m.getSetting('missing', 'default')).toBe('default');
    });

    it('returns the stored value when key is present in the db', () => {
      const { manager: m } = makeManagerWithDb();
      mem['theme'] = 'dark';
      expect(m.getSetting('theme')).toBe('dark');
    });

    it('returns defaultValue after close()', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(m.getSetting('theme', 'fallback')).toBe('fallback');
    });
  });

  // -------------------------------------------------------------------------
  // setSetting()
  // -------------------------------------------------------------------------

  describe('setSetting()', () => {
    it('is a no-op when db is null (does not throw)', () => {
      expect(() => manager.setSetting('key', 'value')).not.toThrow();
    });

    it('calls prepare() with INSERT … ON CONFLICT when db is present', () => {
      const { manager: m, stubDb } = makeManagerWithDb();
      m.setSetting('lang', 'en');
      const calls = vi.mocked(stubDb.prepare).mock.calls;
      expect(calls.some(([sql]) => sql.includes('INSERT INTO settings'))).toBe(true);
    });

    it('persists the value into the in-memory stub store', () => {
      const { manager: m } = makeManagerWithDb();
      m.setSetting('color', 'blue');
      expect(mem['color']).toBe('blue');
    });

    it('is a no-op when db is null after close()', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(() => m.setSetting('x', '1')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // transaction()
  // -------------------------------------------------------------------------

  describe('transaction()', () => {
    it('returns undefined when db is null', () => {
      expect(manager.transaction(() => 42)).toBeUndefined();
    });

    it('wraps the callback with db.transaction when db is present', () => {
      const { manager: m, stubDb } = makeManagerWithDb();
      const fn = vi.fn(() => 'hello');
      m.transaction(fn);
      expect(stubDb.transaction).toHaveBeenCalledWith(fn);
      expect(fn).toHaveBeenCalled();
    });

    it('propagates the return value of the wrapped function', () => {
      const { manager: m } = makeManagerWithDb();
      const result = m.transaction(() => ({ inserted: true }));
      expect(result).toEqual({ inserted: true });
    });
  });

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  describe('close()', () => {
    it('is safe to call when db is already null', () => {
      expect(() => manager.close()).not.toThrow();
    });

    it('calls db.close() on the underlying connection', () => {
      const { manager: m, stubDb } = makeManagerWithDb();
      m.close();
      expect(stubDb.close).toHaveBeenCalled();
    });

    it('sets the db reference to null', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(m.getDatabase()).toBeNull();
    });

    it('resets the initialized flag', () => {
      const { manager: m } = makeManagerWithDb();
      m.close();
      expect(m.isReady()).toBe(false);
    });

    it('handles errors thrown by db.close() without rethrowing', () => {
      const { manager: m, stubDb } = makeManagerWithDb();
      stubDb.close.mockImplementationOnce(() => { throw new Error('close error'); });
      expect(() => m.close()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Module-level singleton export
  // -------------------------------------------------------------------------

  describe('module singleton', () => {
    it('exports a pre-constructed databaseManager singleton', async () => {
      const mod = await import('../../src/main/core/DatabaseManager');
      expect(mod.databaseManager).toBeDefined();
      expect(typeof mod.databaseManager.initialize).toBe('function');
      expect(typeof mod.databaseManager.isReady).toBe('function');
      expect(typeof mod.databaseManager.getDatabase).toBe('function');
      expect(typeof mod.databaseManager.close).toBe('function');
    });

    it('singleton is an instance of DatabaseManager', async () => {
      const mod = await import('../../src/main/core/DatabaseManager');
      expect(mod.databaseManager).toBeInstanceOf(DatabaseManager);
    });
  });
});
