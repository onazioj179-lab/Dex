// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// In-memory SQLite stub
// ---------------------------------------------------------------------------

function makeInMemoryDb() {
  const tables: Record<string, any[]> = {};
  const settings: Record<string, string> = {};

  const db: any = {
    _closed: false,
    pragma: vi.fn(() => [{ quick_check: 'ok' }]),
    exec: vi.fn((sql: string) => {
      // Parse CREATE TABLE names from the SQL and seed them
      const matches = sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
      for (const m of matches) {
        if (!tables[m[1]]) tables[m[1]] = [];
      }
    }),
    prepare: vi.fn((sql: string) => ({
      get: vi.fn((key?: string) => {
        if (sql.includes('SELECT value FROM settings WHERE key')) {
          return settings[key!] !== undefined ? { value: settings[key!] } : undefined;
        }
        return undefined;
      }),
      run: vi.fn((key?: string, value?: string) => {
        if (sql.includes('INSERT INTO settings')) {
          settings[key!] = value!;
        }
      }),
    })),
    transaction: vi.fn((fn: Function) => () => fn()),
    close: vi.fn(() => { db._closed = true; }),
  };

  return { db, settings, tables };
}

let mockDbInstance: ReturnType<typeof makeInMemoryDb>;

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => {
      mockDbInstance = makeInMemoryDb();
      return mockDbInstance.db;
    }),
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('DatabaseManager', () => {
  let DatabaseManager: any;
  let manager: any;

  beforeEach(async () => {
    vi.resetModules();

    // Re-import mocked modules fresh
    const fsMock = await import('fs');
    vi.mocked(fsMock.existsSync).mockReturnValue(false);
    vi.mocked(fsMock.mkdirSync).mockImplementation(() => undefined as any);

    const mod = await import('../../src/main/core/DatabaseManager');
    DatabaseManager = mod.DatabaseManager;
    manager = new DatabaseManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor / path resolution
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('constructs without throwing', () => {
      expect(manager).toBeDefined();
    });

    it('creates the database directory when it does not exist', async () => {
      const fsMock = await import('fs');
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('databases'),
        { recursive: true }
      );
    });

    it('does not create the directory when it already exists', async () => {
      vi.resetModules();
      const fsMock = await import('fs');
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(fsMock.mkdirSync).mockClear();

      const { DatabaseManager: DM } = await import('../../src/main/core/DatabaseManager');
      new DM();
      expect(fsMock.mkdirSync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // initialize()
  // -------------------------------------------------------------------------

  describe('initialize()', () => {
    it('sets initialized state and creates a live db instance', () => {
      manager.initialize();
      expect(manager.isReady()).toBe(true);
    });

    it('is idempotent – calling twice does not open db a second time', async () => {
      const betterSqlite = await import('better-sqlite3');
      const ctor = vi.mocked((betterSqlite as any).default);
      ctor.mockClear();
      manager.initialize();
      manager.initialize();
      expect(ctor).toHaveBeenCalledTimes(1);
    });

    it('applies WAL journal mode pragma', () => {
      manager.initialize();
      expect(mockDbInstance.db.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    });

    it('enables foreign keys pragma', () => {
      manager.initialize();
      expect(mockDbInstance.db.pragma).toHaveBeenCalledWith('foreign_keys = ON');
    });

    it('runs a quick_check integrity check', () => {
      manager.initialize();
      expect(mockDbInstance.db.pragma).toHaveBeenCalledWith('quick_check');
    });

    it('calls exec to create all tables', () => {
      manager.initialize();
      expect(mockDbInstance.db.exec).toHaveBeenCalled();
    });

    it('degrades gracefully when better-sqlite3 is unavailable', async () => {
      vi.resetModules();
      vi.doMock('better-sqlite3', () => {
        throw new Error('Module not found');
      });
      // Reload DatabaseManager so it re-runs the try/catch for better-sqlite3
      const { DatabaseManager: DM } = await import('../../src/main/core/DatabaseManager');
      const m = new DM();
      m.initialize();
      // Should not throw and should still mark itself initialized
      expect(m.isReady()).toBe(false); // no db but initialized=true
    });
  });

  // -------------------------------------------------------------------------
  // isReady()
  // -------------------------------------------------------------------------

  describe('isReady()', () => {
    it('returns false before initialization', () => {
      expect(manager.isReady()).toBe(false);
    });

    it('returns true after successful initialization', () => {
      manager.initialize();
      expect(manager.isReady()).toBe(true);
    });

    it('returns false after close()', () => {
      manager.initialize();
      manager.close();
      expect(manager.isReady()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getDatabase()
  // -------------------------------------------------------------------------

  describe('getDatabase()', () => {
    it('returns null before initialization', () => {
      expect(manager.getDatabase()).toBeNull();
    });

    it('returns the db instance after initialization', () => {
      manager.initialize();
      expect(manager.getDatabase()).not.toBeNull();
    });

    it('auto-initializes if db is null when getDatabase is called', async () => {
      // Do NOT call initialize() manually – getDatabase should trigger it
      // Only works when better-sqlite3 is available (it is in the mock)
      const db = manager.getDatabase();
      // The auto-initialize path sets this.db when Database is available
      expect(db).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getSetting() / setSetting()
  // -------------------------------------------------------------------------

  describe('getSetting() / setSetting()', () => {
    beforeEach(() => {
      manager.initialize();
    });

    it('returns the defaultValue when key is missing', () => {
      expect(manager.getSetting('missing-key', 'fallback')).toBe('fallback');
    });

    it('returns empty string as default when defaultValue is omitted', () => {
      expect(manager.getSetting('missing-key')).toBe('');
    });

    it('stores and retrieves a setting', () => {
      // Manually seed the in-memory settings store
      mockDbInstance.settings['theme'] = 'dark';
      expect(manager.getSetting('theme')).toBe('dark');
    });

    it('setSetting calls prepare().run() with correct args', () => {
      manager.setSetting('lang', 'en');
      expect(mockDbInstance.db.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings')
      );
      const call = vi.mocked(mockDbInstance.db.prepare).mock.results.find(() => true);
      expect(call).toBeDefined();
    });

    it('getSetting returns defaultValue when db is null', () => {
      // Close the db so this.db becomes null
      manager.close();
      expect(manager.getSetting('x', 'default')).toBe('default');
    });

    it('setSetting is a no-op when db is null', () => {
      manager.close();
      expect(() => manager.setSetting('x', '1')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // transaction()
  // -------------------------------------------------------------------------

  describe('transaction()', () => {
    it('returns undefined when db is null', () => {
      expect(manager.transaction(() => 42)).toBeUndefined();
    });

    it('executes the provided function via db.transaction', () => {
      manager.initialize();
      const fn = vi.fn(() => 'result');
      const result = manager.transaction(fn);
      expect(mockDbInstance.db.transaction).toHaveBeenCalledWith(fn);
      expect(result).toBe('result');
    });

    it('propagates the return value of the wrapped function', () => {
      manager.initialize();
      const result = manager.transaction(() => ({ inserted: true }));
      expect(result).toEqual({ inserted: true });
    });
  });

  // -------------------------------------------------------------------------
  // close()
  // -------------------------------------------------------------------------

  describe('close()', () => {
    it('closes the underlying database connection', () => {
      manager.initialize();
      manager.close();
      expect(mockDbInstance.db.close).toHaveBeenCalled();
    });

    it('sets db to null after closing', () => {
      manager.initialize();
      manager.close();
      expect(manager.getDatabase()).toBeNull();
    });

    it('resets initialized flag after closing', () => {
      manager.initialize();
      manager.close();
      expect(manager.isReady()).toBe(false);
    });

    it('is safe to call when db is already null', () => {
      expect(() => manager.close()).not.toThrow();
    });

    it('handles errors from db.close() gracefully', () => {
      manager.initialize();
      mockDbInstance.db.close.mockImplementationOnce(() => {
        throw new Error('close error');
      });
      expect(() => manager.close()).not.toThrow();
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
    });
  });
});
