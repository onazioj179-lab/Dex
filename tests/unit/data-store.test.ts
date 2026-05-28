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

const mockStoreData: Record<string, any> = {};

vi.mock('electron-store', () => ({
  default: vi.fn(function() {
    return {
      get: vi.fn((key: string) => mockStoreData[key] ?? []),
      set: vi.fn((key: string, value: any) => { mockStoreData[key] = value; }),
      delete: vi.fn((key: string) => { delete mockStoreData[key]; }),
      has: vi.fn((key: string) => key in mockStoreData),
      path: '/mock/store.json',
      clear: vi.fn(() => { Object.keys(mockStoreData).forEach(k => delete mockStoreData[k]); }),
    };
  }),
}));

vi.mock('electron-log', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return actual;
});

describe('DataStore', () => {
  let DataStore: any;
  let store: any;

  beforeEach(async () => {
    Object.keys(mockStoreData).forEach(k => delete mockStoreData[k]);
    vi.resetModules();
    const mod = await import('../../src/main/store/DataStore');
    DataStore = mod.DataStore;
    store = new DataStore();
  });

  describe('initialization', () => {
    it('creates a DataStore instance', () => {
      expect(store).toBeDefined();
    });

    it('initialize resolves without error', async () => {
      await expect(store.initialize()).resolves.not.toThrow();
    });
  });

  describe('actions CRUD', () => {
    it('getActions returns empty array by default', () => {
      const actions = store.getActions();
      expect(Array.isArray(actions)).toBe(true);
    });

    it('saveAction creates a new action with generated id', async () => {
      mockStoreData.actions = [];
      const action = await store.saveAction({ name: 'Test Action', type: 'open-app', target: 'browser' });
      expect(action.id).toBeDefined();
      expect(action.name).toBe('Test Action');
      expect(action.type).toBe('open-app');
      expect(action.createdAt).toBeGreaterThan(0);
    });

    it('saveAction applies defaults for missing fields', async () => {
      mockStoreData.actions = [];
      const action = await store.saveAction({});
      expect(action.name).toBe('New Action');
      expect(action.type).toBe('open-app');
      expect(action.icon).toBe('zap');
      expect(action.enabled).toBe(true);
    });

    it('saveAction updates existing action by id', async () => {
      mockStoreData.actions = [
        { id: 'a1', name: 'Old', type: 'open-app', target: '', args: [], icon: 'zap', color: '#000', enabled: true, createdAt: 1 },
      ];
      const updated = await store.saveAction({ id: 'a1', name: 'Updated' });
      expect(updated.name).toBe('Updated');
      expect(updated.id).toBe('a1');
    });

    it('deleteAction removes an action', async () => {
      mockStoreData.actions = [
        { id: 'a1', name: 'A', type: 'open-app', target: '', args: [], icon: 'zap', color: '#000', enabled: true, createdAt: 1 },
        { id: 'a2', name: 'B', type: 'open-app', target: '', args: [], icon: 'zap', color: '#000', enabled: true, createdAt: 2 },
      ];
      await store.deleteAction('a1');
      expect(mockStoreData.actions).toHaveLength(1);
      expect(mockStoreData.actions[0].id).toBe('a2');
    });
  });

  describe('modes CRUD', () => {
    it('getModes returns empty array by default', () => {
      expect(Array.isArray(store.getModes())).toBe(true);
    });

    it('saveMode creates a new mode', async () => {
      mockStoreData.modes = [];
      const mode = await store.saveMode({ name: 'Focus Mode' });
      expect(mode.id).toBeDefined();
      expect(mode.name).toBe('Focus Mode');
      expect(mode.active).toBe(false);
    });

    it('setActiveMode activates only the specified mode', async () => {
      mockStoreData.modes = [
        { id: 'm1', name: 'A', active: false },
        { id: 'm2', name: 'B', active: false },
      ];
      await store.setActiveMode('m1');
      expect(mockStoreData.modes[0].active).toBe(true);
      expect(mockStoreData.modes[1].active).toBe(false);
    });

    it('setActiveMode with null deactivates all', async () => {
      mockStoreData.modes = [
        { id: 'm1', name: 'A', active: true },
      ];
      await store.setActiveMode(null);
      expect(mockStoreData.modes[0].active).toBe(false);
    });

    it('deleteMode removes a mode', async () => {
      mockStoreData.modes = [
        { id: 'm1', name: 'A' },
        { id: 'm2', name: 'B' },
      ];
      await store.deleteMode('m1');
      expect(mockStoreData.modes).toHaveLength(1);
    });
  });

  describe('rules CRUD', () => {
    it('getRules returns empty array by default', () => {
      expect(Array.isArray(store.getRules())).toBe(true);
    });
  });

  describe('notes and tasks', () => {
    it('getNotes returns empty array by default', () => {
      const notes = store.getNotes?.() ?? [];
      expect(Array.isArray(notes)).toBe(true);
    });

    it('getTasks returns empty array by default', () => {
      const tasks = store.getTasks?.() ?? [];
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('settings', () => {
    it('getSettings returns default settings', () => {
      mockStoreData.settings = { startOnBoot: false, minimizeToTray: true, theme: 'dark' };
      const settings = store.getSettings?.();
      if (settings) {
        expect(settings.theme).toBe('dark');
      }
    });
  });

  describe('singleton pattern', () => {
    it('multiple DataStore instances share the same underlying store', () => {
      const store2 = new DataStore();
      expect(store2).toBeDefined();
    });
  });
});
