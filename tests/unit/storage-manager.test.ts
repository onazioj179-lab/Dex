// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory filesystem mock
// ---------------------------------------------------------------------------

const fsStore: Map<string, any> = new Map();
const ipcHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/mock/userData') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => fsStore.has(p)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: string, enc?: string) => {
    const data = fsStore.get(p);
    if (data === undefined) throw new Error(`ENOENT: ${p}`);
    return enc ? JSON.stringify(data) : data;
  }),
  writeFileSync: vi.fn((p: string, data: any) => {
    try { fsStore.set(p, typeof data === 'string' ? JSON.parse(data) : data); } catch { fsStore.set(p, data); }
  }),
  unlinkSync: vi.fn((p: string) => { fsStore.delete(p); }),
  readdirSync: vi.fn((_p: string) => []),
  statSync: vi.fn((_p: string) => ({ size: 100, isDirectory: () => false, mtime: new Date(0), birthtime: new Date(0) })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageManager', () => {
  let storageManager: any;
  const fakeEvent = {} as any;

  beforeEach(async () => {
    fsStore.clear();
    ipcHandlers.clear();
    vi.resetModules();

    const mod = await import('../../src/main/core/StorageManager');
    storageManager = mod.storageManager;
    // Give the async initialize() a tick to settle
    await new Promise(r => setTimeout(r, 0));
  });

  describe('IPC handler registration', () => {
    it('registers storage:getStats', () => {
      expect(ipcHandlers.has('storage:getStats')).toBe(true);
    });

    it('registers storage:getConfig', () => {
      expect(ipcHandlers.has('storage:getConfig')).toBe(true);
    });

    it('registers storage:store', () => {
      expect(ipcHandlers.has('storage:store')).toBe(true);
    });

    it('registers storage:retrieve', () => {
      expect(ipcHandlers.has('storage:retrieve')).toBe(true);
    });

    it('registers storage:delete', () => {
      expect(ipcHandlers.has('storage:delete')).toBe(true);
    });

    it('registers storage:search', () => {
      expect(ipcHandlers.has('storage:search')).toBe(true);
    });

    it('registers storage:runCleanup', () => {
      expect(ipcHandlers.has('storage:runCleanup')).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('returns default config with 500MB limit', () => {
      const config = storageManager.getConfig();
      expect(config.maxStorageMB).toBe(500);
      expect(config.maxCacheMB).toBe(100);
      expect(config.autoCleanup).toBe(true);
    });

    it('returns a copy (immutable)', () => {
      const config = storageManager.getConfig();
      config.maxStorageMB = 9999;
      expect(storageManager.getConfig().maxStorageMB).toBe(500);
    });
  });

  describe('updateConfig', () => {
    it('merges config updates', async () => {
      await storageManager.updateConfig({ maxStorageMB: 1000 });
      expect(storageManager.getConfig().maxStorageMB).toBe(1000);
    });

    it('preserves unmodified fields', async () => {
      await storageManager.updateConfig({ maxStorageMB: 1000 });
      expect(storageManager.getConfig().autoCleanup).toBe(true);
      expect(storageManager.getConfig().maxCacheMB).toBe(100);
    });

    it('returns true on success', async () => {
      const result = await storageManager.updateConfig({ maxStorageMB: 200 });
      expect(result).toBe(true);
    });
  });

  describe('store and retrieve', () => {
    it('stores and retrieves a note', async () => {
      const data = { title: 'My Note', content: 'Hello' };
      const storeResult = await storageManager.store('note', 'note-1', data);
      expect(storeResult.success).toBe(true);

      const retrieved = await storageManager.retrieve('note', 'note-1');
      expect(retrieved).toEqual(data);
    });

    it('stores and retrieves cache data', async () => {
      const cacheData = { url: 'https://example.com', response: 'cached' };
      await storageManager.store('cache', 'cache-key-1', cacheData);
      const result = await storageManager.retrieve('cache', 'cache-key-1');
      expect(result).toEqual(cacheData);
    });

    it('retrieve returns null for missing entry', async () => {
      const result = await storageManager.retrieve('note', 'nonexistent');
      expect(result).toBeNull();
    });

    it('store returns path in result', async () => {
      const result = await storageManager.store('note', 'note-path', { text: 'test' });
      expect(result.success).toBe(true);
      expect(result.path).toContain('note-path');
    });

    it('stores metadata with tags', async () => {
      const result = await storageManager.store(
        'note', 'tagged-note',
        { content: 'test' },
        { tags: ['work', 'important'] }
      );
      expect(result.success).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes stored data', async () => {
      await storageManager.store('note', 'del-note', { text: 'delete me' });
      const deleted = await storageManager.delete('note', 'del-note');
      expect(deleted).toBe(true);
    });

    it('retrieve returns null after delete', async () => {
      await storageManager.store('note', 'del-note-2', { text: 'delete me' });
      await storageManager.delete('note', 'del-note-2');
      const result = await storageManager.retrieve('note', 'del-note-2');
      expect(result).toBeNull();
    });

    it('delete non-existent entry returns true (idempotent)', async () => {
      const result = await storageManager.delete('note', 'not-there');
      expect(result).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns correct shape', async () => {
      const stats = await storageManager.getStats();
      expect(typeof stats.totalUsedBytes).toBe('number');
      expect(typeof stats.totalUsedMB).toBe('number');
      expect(stats.limitMB).toBe(500);
      expect(typeof stats.usagePercent).toBe('number');
      expect(stats.breakdown).toBeDefined();
      expect(typeof stats.fileCount).toBe('number');
    });

    it('healthStatus is healthy when usage is low', async () => {
      const stats = await storageManager.getStats();
      expect(stats.healthStatus).toBe('healthy');
    });

    it('breakdown has required keys', async () => {
      const stats = await storageManager.getStats();
      expect(stats.breakdown).toHaveProperty('notes');
      expect(stats.breakdown).toHaveProperty('logs');
      expect(stats.breakdown).toHaveProperty('cache');
      expect(stats.breakdown).toHaveProperty('metadata');
    });
  });

  describe('search', () => {
    it('returns empty array for no matching entries', async () => {
      const results = await storageManager.search('nonexistent');
      expect(results).toEqual([]);
    });

    it('finds stored entries by name', async () => {
      await storageManager.store('note', 'meeting-notes', { text: 'notes' }, {
        metadata: { name: 'Meeting Notes' },
      });
      const results = await storageManager.search('Meeting');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('respects limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await storageManager.store('note', `note-${i}`, { text: 'note' }, {
          metadata: { name: `My Note ${i}` },
        });
      }
      const results = await storageManager.search('My Note', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('listByType', () => {
    it('returns entries of matching type', async () => {
      await storageManager.store('note', 'type-note-1', { text: 'note' }, {
        metadata: { name: 'Note 1' },
      });
      const notes = await storageManager.listByType('note');
      expect(Array.isArray(notes)).toBe(true);
    });
  });

  describe('getLocations', () => {
    it('returns array of storage locations', () => {
      const locations = storageManager.getLocations();
      expect(Array.isArray(locations)).toBe(true);
      expect(locations.length).toBeGreaterThan(0);
    });

    it('each location has required fields', () => {
      const locations = storageManager.getLocations();
      for (const loc of locations) {
        expect(loc).toHaveProperty('id');
        expect(loc).toHaveProperty('name');
        expect(loc).toHaveProperty('path');
        expect(loc).toHaveProperty('type');
      }
    });
  });

  describe('runCleanup', () => {
    it('returns cleanup stats', async () => {
      const result = await storageManager.runCleanup();
      expect(typeof result.deletedFiles).toBe('number');
      expect(typeof result.freedBytes).toBe('number');
      expect(typeof result.categories).toBe('object');
    });

    it('cleanup result has expected category keys', async () => {
      const result = await storageManager.runCleanup();
      expect(result.categories).toHaveProperty('logs');
      expect(result.categories).toHaveProperty('cache');
    });
  });

  describe('IPC via handlers', () => {
    it('storage:getConfig returns config', async () => {
      const config = await ipcHandlers.get('storage:getConfig')!(fakeEvent);
      expect(config.maxStorageMB).toBe(500);
    });

    it('storage:store returns success', async () => {
      const result = await ipcHandlers.get('storage:store')!(fakeEvent, 'note', 'ipc-note', { text: 'hello' });
      expect(result.success).toBe(true);
    });

    it('storage:retrieve returns data after store', async () => {
      await ipcHandlers.get('storage:store')!(fakeEvent, 'note', 'ipc-note-2', { key: 'value' });
      const result = await ipcHandlers.get('storage:retrieve')!(fakeEvent, 'note', 'ipc-note-2');
      expect(result).toEqual({ key: 'value' });
    });

    it('storage:search returns array', async () => {
      const results = await ipcHandlers.get('storage:search')!(fakeEvent, 'test');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
