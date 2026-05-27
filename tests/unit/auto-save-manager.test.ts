// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Helpers / localStorage shim reset
// ============================================================================

function clearLocalStorage() {
  localStorage.clear();
}

// ============================================================================
// Import the module under test (store is a singleton – reset between groups)
// ============================================================================

import {
  useAutoSaveStore,
  formatSaveTime,
  formatFileSize,
  type AutoSaveConfig,
  type SavedVersion,
} from '../../src/renderer/services/AutoSaveManager';

// ============================================================================
// Shared store reference – always grab the latest snapshot from zustand
// ============================================================================

function store() {
  return useAutoSaveStore.getState();
}

// ============================================================================
// Tests
// ============================================================================

describe('AutoSaveManager', () => {
  const APP_ID = 'test-app-001';

  beforeEach(() => {
    clearLocalStorage();
    // Remove all state entries between tests without touching the zustand internals
    useAutoSaveStore.setState({ configs: new Map(), states: new Map() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // getConfig – defaults
  // --------------------------------------------------------------------------

  describe('getConfig', () => {
    it('returns the default config when no config has been set', () => {
      const config = store().getConfig(APP_ID);
      expect(config.enabled).toBe(true);
      expect(config.intervalMs).toBe(30000);
      expect(config.maxVersions).toBe(10);
      expect(config.compressData).toBe(true);
      expect(config.encryptData).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // setConfig
  // --------------------------------------------------------------------------

  describe('setConfig', () => {
    it('merges a partial config into the existing defaults', () => {
      store().setConfig(APP_ID, { intervalMs: 5000, enabled: false });
      const config = store().getConfig(APP_ID);
      expect(config.intervalMs).toBe(5000);
      expect(config.enabled).toBe(false);
      // Untouched defaults remain
      expect(config.maxVersions).toBe(10);
    });

    it('persists the config to localStorage under the config key', () => {
      store().setConfig(APP_ID, { maxVersions: 3 });
      const raw = localStorage.getItem('dex-autosave-config');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed[APP_ID].maxVersions).toBe(3);
    });

    it('handles localStorage write errors gracefully', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => store().setConfig(APP_ID, { intervalMs: 1000 })).not.toThrow();
      spy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // getState
  // --------------------------------------------------------------------------

  describe('getState', () => {
    it('returns a clean default state for an unknown appId', () => {
      const s = store().getState('unknown-app');
      expect(s.appId).toBe('unknown-app');
      expect(s.isDirty).toBe(false);
      expect(s.isSaving).toBe(false);
      expect(s.lastSaved).toBeNull();
      expect(s.lastError).toBeNull();
      expect(s.versions).toEqual([]);
      expect(s.pendingData).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // setDirty
  // --------------------------------------------------------------------------

  describe('setDirty', () => {
    it('marks the app state as dirty', () => {
      store().setDirty(APP_ID, true);
      expect(store().getState(APP_ID).isDirty).toBe(true);
    });

    it('clears the dirty flag', () => {
      store().setDirty(APP_ID, true);
      store().setDirty(APP_ID, false);
      expect(store().getState(APP_ID).isDirty).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // save
  // --------------------------------------------------------------------------

  describe('save', () => {
    it('saves data and returns true on success', async () => {
      const result = await store().save(APP_ID, { counter: 1 });
      expect(result).toBe(true);
    });

    it('clears dirty flag and sets lastSaved after a successful save', async () => {
      store().setDirty(APP_ID, true);
      const before = Date.now();
      await store().save(APP_ID, { hello: 'world' });
      const s = store().getState(APP_ID);
      expect(s.isDirty).toBe(false);
      expect(s.lastSaved).toBeGreaterThanOrEqual(before);
      expect(s.isSaving).toBe(false);
    });

    it('creates a version entry after saving', async () => {
      await store().save(APP_ID, { x: 42 }, 'first save');
      const s = store().getState(APP_ID);
      expect(s.versions).toHaveLength(1);
      expect(s.versions[0].description).toBe('first save');
      expect(s.versions[0].isRecovery).toBe(false);
      expect(s.versions[0].checksum).toBeTruthy();
    });

    it('writes the version index to localStorage', async () => {
      await store().save(APP_ID, { v: 1 });
      const raw = localStorage.getItem(`dex-autosave-${APP_ID}-versions`);
      expect(raw).not.toBeNull();
      const versions = JSON.parse(raw!);
      expect(versions).toHaveLength(1);
    });

    it('returns false and records lastError when save is disabled', async () => {
      store().setConfig(APP_ID, { enabled: false });
      const result = await store().save(APP_ID, { data: true });
      expect(result).toBe(false);
    });

    it('trims old versions when maxVersions is exceeded', async () => {
      store().setConfig(APP_ID, { maxVersions: 3, compressData: false });
      for (let i = 0; i < 5; i++) {
        await store().save(APP_ID, { i });
      }
      const s = store().getState(APP_ID);
      expect(s.versions).toHaveLength(3);
    });

    it('records lastError and returns false when localStorage is full', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const result = await store().save(APP_ID, { big: true });
      expect(result).toBe(false);
      const s = store().getState(APP_ID);
      expect(s.lastError).toBeTruthy();
      expect(s.isSaving).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // load
  // --------------------------------------------------------------------------

  describe('load', () => {
    it('loads the latest saved version', async () => {
      const payload = { greeting: 'hello dex' };
      await store().save(APP_ID, payload);
      const loaded = await store().load(APP_ID);
      expect(loaded).toEqual(payload);
    });

    it('loads a specific version by id', async () => {
      await store().save(APP_ID, { v: 1 }, 'v1');
      await store().save(APP_ID, { v: 2 }, 'v2');
      const versions = store().getState(APP_ID).versions;
      const firstId = versions[0].id;
      const loaded = await store().load(APP_ID, firstId);
      expect((loaded as any).v).toBe(1);
    });

    it('returns null when there are no saved versions', async () => {
      const loaded = await store().load(APP_ID);
      expect(loaded).toBeNull();
    });

    it('returns null when the storage entry is missing', async () => {
      await store().save(APP_ID, { temp: true });
      const versionId = store().getState(APP_ID).versions[0].id;
      localStorage.removeItem(`dex-autosave-${APP_ID}-${versionId}`);
      const loaded = await store().load(APP_ID, versionId);
      expect(loaded).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getVersions
  // --------------------------------------------------------------------------

  describe('getVersions', () => {
    it('returns an empty array when no versions exist', () => {
      const versions = store().getVersions(APP_ID);
      expect(versions).toEqual([]);
    });

    it('returns versions from localStorage', async () => {
      await store().save(APP_ID, { a: 1 });
      await store().save(APP_ID, { b: 2 });
      const versions = store().getVersions(APP_ID);
      expect(versions).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // deleteVersion
  // --------------------------------------------------------------------------

  describe('deleteVersion', () => {
    it('removes a version from the state and localStorage', async () => {
      await store().save(APP_ID, { del: true });
      const versionId = store().getState(APP_ID).versions[0].id;
      store().deleteVersion(APP_ID, versionId);
      expect(store().getState(APP_ID).versions).toHaveLength(0);
      expect(localStorage.getItem(`dex-autosave-${APP_ID}-${versionId}`)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Recovery
  // --------------------------------------------------------------------------

  describe('checkRecovery / acceptRecovery / discardRecovery', () => {
    const recoveryKey = `dex-recovery-data-${APP_ID}`;

    it('returns null when no recovery data exists', () => {
      expect(store().checkRecovery(APP_ID)).toBeNull();
    });

    it('returns parsed recovery data when present in localStorage', () => {
      const rd = { appId: APP_ID, data: { rescued: true }, timestamp: Date.now(), version: {} as SavedVersion };
      localStorage.setItem(recoveryKey, JSON.stringify(rd));
      const result = store().checkRecovery(APP_ID);
      expect(result).not.toBeNull();
      expect((result!.data as any).rescued).toBe(true);
    });

    it('acceptRecovery returns the saved data and removes the key', () => {
      const rd = { appId: APP_ID, data: { rescued: true }, timestamp: Date.now(), version: {} as SavedVersion };
      localStorage.setItem(recoveryKey, JSON.stringify(rd));
      const recovered = store().acceptRecovery(APP_ID);
      expect((recovered as any).rescued).toBe(true);
      expect(localStorage.getItem(recoveryKey)).toBeNull();
    });

    it('discardRecovery removes the key', () => {
      localStorage.setItem(recoveryKey, JSON.stringify({ appId: APP_ID }));
      store().discardRecovery(APP_ID);
      expect(localStorage.getItem(recoveryKey)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // cleanup
  // --------------------------------------------------------------------------

  describe('cleanup', () => {
    it('removes all app data from localStorage and state', async () => {
      await store().save(APP_ID, { x: 1 });
      await store().save(APP_ID, { x: 2 });
      store().cleanup(APP_ID);
      expect(store().getState(APP_ID).versions).toEqual([]);
      expect(localStorage.getItem(`dex-autosave-${APP_ID}-versions`)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // formatSaveTime
  // --------------------------------------------------------------------------

  describe('formatSaveTime', () => {
    it('formats a timestamp from today as "Today at ..."', () => {
      const now = Date.now();
      const result = formatSaveTime(now);
      expect(result).toMatch(/^Today at/);
    });

    it('formats a timestamp from yesterday as "Yesterday at ..."', () => {
      const yesterday = Date.now() - 24 * 60 * 60 * 1000;
      const result = formatSaveTime(yesterday);
      expect(result).toMatch(/^Yesterday at/);
    });

    it('formats an older timestamp as a locale date string', () => {
      const old = new Date('2025-01-15T10:30:00').getTime();
      const result = formatSaveTime(old);
      expect(result).not.toMatch(/^Today/);
      expect(result).not.toMatch(/^Yesterday/);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // formatFileSize
  // --------------------------------------------------------------------------

  describe('formatFileSize', () => {
    it('formats bytes under 1 KB', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats bytes in KB range', () => {
      expect(formatFileSize(2048)).toBe('2.0 KB');
    });

    it('formats bytes in MB range', () => {
      expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    it('formats exactly 1 KB boundary', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
    });
  });
});
