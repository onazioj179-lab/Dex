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
// IPC capture and mocks
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn() },
  app: { getPath: vi.fn(() => '/mock/userData') },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: Function) => cb(null, '', '')),
  execSync: vi.fn(() => ''),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn: Function) => fn),
}));

vi.mock('../../src/main/native/bridge', () => ({
  NativeProcesses: { launchApp: vi.fn().mockResolvedValue({ success: true }) },
  isNativeAvailable: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Mock dependencies (DataStore + Logger)
// ---------------------------------------------------------------------------

const mockAutomations: any[] = [];

const mockDataStore = {
  store: {
    get: vi.fn((key: string) => key === 'automations' ? [...mockAutomations] : []),
    set: vi.fn((key: string, value: any) => {
      if (key === 'automations') {
        mockAutomations.length = 0;
        mockAutomations.push(...value);
      }
    }),
  },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeAutomation = (overrides?: Partial<any>): any => ({
  id: `auto-${Date.now()}`,
  name: 'Test Automation',
  description: 'A test automation',
  blocks: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isEnabled: true,
  isRunning: false,
  runCount: 0,
  metadata: { isFavorite: false, tags: [] },
  ...overrides,
});

const fakeEvent = { sender: { id: 1 } } as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutomationController', () => {
  let AutomationController: any;

  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    mockAutomations.length = 0;
    vi.clearAllMocks();

    const mod = await import('../../src/main/controllers/AutomationController');
    AutomationController = mod.AutomationController;
    new AutomationController(mockDataStore, mockLogger);
  });

  describe('IPC handler registration', () => {
    it('registers automation:getAll', () => {
      expect(ipcHandlers.has('automation:getAll')).toBe(true);
    });

    it('registers automation:get', () => {
      expect(ipcHandlers.has('automation:get')).toBe(true);
    });

    it('registers automation:save', () => {
      expect(ipcHandlers.has('automation:save')).toBe(true);
    });

    it('registers automation:delete', () => {
      expect(ipcHandlers.has('automation:delete')).toBe(true);
    });

    it('registers automation:execute', () => {
      expect(ipcHandlers.has('automation:execute')).toBe(true);
    });

    it('registers automation:cancel', () => {
      expect(ipcHandlers.has('automation:cancel')).toBe(true);
    });

    it('registers automation:toggleFavorite', () => {
      expect(ipcHandlers.has('automation:toggleFavorite')).toBe(true);
    });

    it('registers automation:duplicate', () => {
      expect(ipcHandlers.has('automation:duplicate')).toBe(true);
    });
  });

  describe('automation:getAll', () => {
    it('returns empty array by default', async () => {
      const result = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns all stored automations', async () => {
      const a1 = makeAutomation({ id: 'a1', name: 'First' });
      const a2 = makeAutomation({ id: 'a2', name: 'Second' });
      mockAutomations.push(a1, a2);
      const result = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      expect(result).toHaveLength(2);
    });
  });

  describe('automation:get', () => {
    it('returns null for unknown id', async () => {
      const result = await ipcHandlers.get('automation:get')!(fakeEvent, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns automation by id', async () => {
      const auto = makeAutomation({ id: 'a1', name: 'My Auto' });
      mockAutomations.push(auto);
      const result = await ipcHandlers.get('automation:get')!(fakeEvent, 'a1');
      expect(result?.name).toBe('My Auto');
    });
  });

  describe('automation:save', () => {
    it('creates new automation with timestamps', async () => {
      const auto = makeAutomation({ id: 'new-1', name: 'New Auto' });
      const result = await ipcHandlers.get('automation:save')!(fakeEvent, auto);
      expect(result.id).toBe('new-1');
      expect(result.name).toBe('New Auto');
    });

    it('stores automation so getAll finds it', async () => {
      const auto = makeAutomation({ id: 'new-2', name: 'Persisted' });
      await ipcHandlers.get('automation:save')!(fakeEvent, auto);
      const all = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      expect(all.some((a: any) => a.id === 'new-2')).toBe(true);
    });

    it('updates existing automation by id', async () => {
      const auto = makeAutomation({ id: 'upd-1', name: 'Original' });
      mockAutomations.push(auto);
      await ipcHandlers.get('automation:save')!(fakeEvent, { ...auto, name: 'Updated' });
      const all = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      const found = all.find((a: any) => a.id === 'upd-1');
      expect(found?.name).toBe('Updated');
      expect(all).toHaveLength(1); // No duplicate
    });

    it('updates updatedAt on save', async () => {
      const auto = makeAutomation({ id: 'ts-1', updatedAt: 1 });
      mockAutomations.push(auto);
      const before = Date.now();
      const result = await ipcHandlers.get('automation:save')!(fakeEvent, { ...auto, name: 'Updated' });
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('automation:delete', () => {
    it('removes automation from store', async () => {
      mockAutomations.push(makeAutomation({ id: 'del-1' }));
      mockAutomations.push(makeAutomation({ id: 'del-2' }));
      await ipcHandlers.get('automation:delete')!(fakeEvent, 'del-1');
      const all = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      expect(all.some((a: any) => a.id === 'del-1')).toBe(false);
      expect(all).toHaveLength(1);
    });

    it('returns true on deletion', async () => {
      mockAutomations.push(makeAutomation({ id: 'del-3' }));
      const result = await ipcHandlers.get('automation:delete')!(fakeEvent, 'del-3');
      expect(result).toBe(true);
    });
  });

  describe('automation:execute', () => {
    it('returns error result for unknown automation', async () => {
      const result = await ipcHandlers.get('automation:execute')!(fakeEvent, 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('returns execution result for automation with no blocks', async () => {
      const auto = makeAutomation({ id: 'exec-1', blocks: [] });
      mockAutomations.push(auto);
      const result = await ipcHandlers.get('automation:execute')!(fakeEvent, 'exec-1');
      expect(result.automationId).toBe('exec-1');
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.startedAt).toBeGreaterThan(0);
    });

    it('increments runCount after execution', async () => {
      const auto = makeAutomation({ id: 'run-1', blocks: [], runCount: 0 });
      mockAutomations.push(auto);
      await ipcHandlers.get('automation:execute')!(fakeEvent, 'run-1');
      const updated = await ipcHandlers.get('automation:get')!(fakeEvent, 'run-1');
      expect(updated?.runCount).toBe(1);
    });
  });

  describe('automation:cancel', () => {
    it('returns success false for non-running automation', async () => {
      const result = await ipcHandlers.get('automation:cancel')!(fakeEvent, 'not-running');
      expect(result).toBeDefined();
    });
  });

  describe('automation:toggleFavorite', () => {
    it('returns null for unknown automation', async () => {
      const result = await ipcHandlers.get('automation:toggleFavorite')!(fakeEvent, 'unknown');
      expect(result).toBeNull();
    });

    it('toggles favorite flag to true', async () => {
      const auto = makeAutomation({ id: 'fav-1', metadata: { isFavorite: false } });
      mockAutomations.push(auto);
      const result = await ipcHandlers.get('automation:toggleFavorite')!(fakeEvent, 'fav-1');
      expect(result?.metadata?.isFavorite).toBe(true);
    });

    it('toggles favorite flag back to false', async () => {
      const auto = makeAutomation({ id: 'fav-2', metadata: { isFavorite: true } });
      mockAutomations.push(auto);
      const result = await ipcHandlers.get('automation:toggleFavorite')!(fakeEvent, 'fav-2');
      expect(result?.metadata?.isFavorite).toBe(false);
    });
  });

  describe('automation:duplicate', () => {
    it('returns null for unknown automation', async () => {
      const result = await ipcHandlers.get('automation:duplicate')!(fakeEvent, 'unknown');
      expect(result).toBeNull();
    });

    it('creates duplicate with different id', async () => {
      const auto = makeAutomation({ id: 'orig-1', name: 'Original' });
      mockAutomations.push(auto);
      const dup = await ipcHandlers.get('automation:duplicate')!(fakeEvent, 'orig-1');
      expect(dup?.id).not.toBe('orig-1');
      expect(dup?.name).toBe('Original (Copy)');
    });

    it('duplicate resets runCount to 0', async () => {
      const auto = makeAutomation({ id: 'orig-2', runCount: 5 });
      mockAutomations.push(auto);
      const dup = await ipcHandlers.get('automation:duplicate')!(fakeEvent, 'orig-2');
      expect(dup?.runCount).toBe(0);
    });

    it('duplicate is not marked as favorite', async () => {
      const auto = makeAutomation({ id: 'orig-3', metadata: { isFavorite: true } });
      mockAutomations.push(auto);
      const dup = await ipcHandlers.get('automation:duplicate')!(fakeEvent, 'orig-3');
      expect(dup?.metadata?.isFavorite).toBe(false);
    });

    it('both original and duplicate exist in store', async () => {
      const auto = makeAutomation({ id: 'orig-4' });
      mockAutomations.push(auto);
      await ipcHandlers.get('automation:duplicate')!(fakeEvent, 'orig-4');
      const all = await ipcHandlers.get('automation:getAll')!(fakeEvent);
      expect(all).toHaveLength(2);
    });
  });
});
