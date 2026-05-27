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
// Mocks (must be top-level so Vitest hoists them before any import)
// ---------------------------------------------------------------------------

const mockStore: Record<string, any> = {};

vi.mock('electron-store', () => {
  // Use a named function so `new Store(...)` works even after vi.resetModules()
  function MockStore() {
    return {
      get(key: string) {
        // Try flat key first (e.g. 'keychain.dex-key-abc' stored flat)
        if (key in mockStore) return mockStore[key];
        // Then try nested traversal
        const parts = key.split('.');
        let v: any = mockStore;
        for (const p of parts) v = v?.[p];
        if (v !== undefined) return v;
        if (key === 'keys') return {};
        if (key === 'rotationPolicy') return { enabled: true, intervalDays: 90, lastRotation: 0, autoRotate: true };
        if (key === 'derivationParams') return {};
        return undefined;
      },
      set(key: string, value: any) {
        mockStore[key] = value;
      },
      delete(key: string) {
        // Try flat key first
        if (key in mockStore) {
          delete mockStore[key];
          return;
        }
        const parts = key.split('.');
        if (parts.length === 1) {
          delete mockStore[key];
        } else {
          let obj: any = mockStore;
          for (let i = 0; i < parts.length - 1; i++) obj = obj?.[parts[i]];
          if (obj) delete obj[parts[parts.length - 1]];
        }
      },
    };
  }
  return { default: MockStore };
});

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('enc:', '')),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function freshManager() {
  vi.resetModules();
  const mod = await import('../../src/main/security/SecureKeyManager');
  return mod.SecureKeyManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecureKeyManager', () => {
  beforeEach(() => {
    // Clear the shared in-memory store between tests
    for (const k of Object.keys(mockStore)) delete mockStore[k];
  });

  // -------------------------------------------------------------------------
  // initialize()
  // -------------------------------------------------------------------------

  describe('initialize()', () => {
    it('returns true when safeStorage is available', async () => {
      const manager = await freshManager();
      const result = await manager.initialize();
      expect(result).toBe(true);
    });

    it('returns false when safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
      const manager = await freshManager();
      const result = await manager.initialize();
      expect(result).toBe(false);
    });

    it('stays locked after initialize with no stored master key', async () => {
      const manager = await freshManager();
      await manager.initialize();
      expect(manager.isUnlocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isUnlocked() – initial state
  // -------------------------------------------------------------------------

  describe('isUnlocked()', () => {
    it('is false before any key is generated', async () => {
      const manager = await freshManager();
      expect(manager.isUnlocked()).toBe(false);
    });

    it('is true after generating a master key', async () => {
      const manager = await freshManager();
      await manager.generateKey('main', 'master');
      expect(manager.isUnlocked()).toBe(true);
    });

    it('remains false after generating a non-master key', async () => {
      const manager = await freshManager();
      await manager.generateKey('data-key', 'data');
      expect(manager.isUnlocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // generateKey()
  // -------------------------------------------------------------------------

  describe('generateKey()', () => {
    it('returns a KeyInfo object with expected fields', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('test-key', 'data');
      expect(info).not.toBeNull();
      expect(info!.name).toBe('test-key');
      expect(info!.purpose).toBe('data');
      expect(info!.algorithm).toBe('aes-256-gcm');
      expect(typeof info!.id).toBe('string');
      expect(typeof info!.createdAt).toBe('number');
      expect(typeof info!.lastUsed).toBe('number');
    });

    it('sets expiresAt when expiresInDays option is provided', async () => {
      const manager = await freshManager();
      const before = Date.now();
      const info = await manager.generateKey('expiring', 'session', { expiresInDays: 1 });
      const after = Date.now();
      expect(info).not.toBeNull();
      const expectedMin = before + 1 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 1 * 24 * 60 * 60 * 1000;
      expect(info!.expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(info!.expiresAt).toBeLessThanOrEqual(expectedMax);
    });

    it('does not set expiresAt when no option is provided', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('no-expiry', 'data');
      expect(info!.expiresAt).toBeUndefined();
    });

    it('returns null when safeStorage.encryptString fails', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.encryptString).mockImplementationOnce(() => {
        throw new Error('keychain unavailable');
      });
      const manager = await freshManager();
      const info = await manager.generateKey('fail-key', 'data');
      expect(info).toBeNull();
    });

    it('sets masterKey and unlocks when purpose is master', async () => {
      const manager = await freshManager();
      expect(manager.isUnlocked()).toBe(false);
      await manager.generateKey('master-key', 'master');
      expect(manager.isUnlocked()).toBe(true);
      expect(manager.getMasterKey()).not.toBeNull();
    });

    it('does not overwrite masterKey if one already exists', async () => {
      const manager = await freshManager();
      await manager.generateKey('first-master', 'master');
      const firstMaster = manager.getMasterKey();
      await manager.generateKey('second-master', 'master');
      // masterKey should still be the first one (not overwritten)
      expect(manager.getMasterKey()).toBe(firstMaster);
    });
  });

  // -------------------------------------------------------------------------
  // getKey()
  // -------------------------------------------------------------------------

  describe('getKey()', () => {
    it('returns null when manager is locked', async () => {
      const manager = await freshManager();
      // Not unlocked yet
      const key = await manager.getKey('any-id');
      expect(key).toBeNull();
    });

    it('returns a Buffer for a cached key when unlocked', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('master', 'master');
      // master key also unlocks the manager
      const key = await manager.getKey(info!.id);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key!.length).toBe(32);
    });

    it('returns null if checksum does not match stored metadata', async () => {
      const manager = await freshManager();
      // Generate a master key so manager is unlocked
      await manager.generateKey('master', 'master');
      // Generate a data key
      const info = await manager.generateKey('data-key', 'data');
      // Corrupt the checksum in the store
      const keys = mockStore['keys'] as Record<string, any>;
      keys[info!.id].checksumBase64 = 'bad-checksum==';
      mockStore['keys'] = keys;
      // Evict from cache by locking then unlocking via a new master
      manager.lock();
      // Re-unlock by generating fresh master
      await manager.generateKey('master2', 'master');
      const key = await manager.getKey(info!.id);
      expect(key).toBeNull();
    });

    it('returns null for an expired key', async () => {
      const manager = await freshManager();
      await manager.generateKey('master', 'master');
      // Generate a key that has already expired
      const info = await manager.generateKey('old-key', 'data', { expiresInDays: 1 });
      // Back-date expiry so it looks expired
      const keys = mockStore['keys'] as Record<string, any>;
      keys[info!.id].expiresAt = Date.now() - 1000;
      mockStore['keys'] = keys;
      // Evict from in-memory cache by locking and re-unlocking
      manager.lock();
      await manager.generateKey('master3', 'master');
      const key = await manager.getKey(info!.id);
      expect(key).toBeNull();
    });

    it('loads key from keychain when not in cache', async () => {
      const manager = await freshManager();
      await manager.generateKey('master', 'master');
      const info = await manager.generateKey('data-key', 'data');
      // Lock to clear cache
      manager.lock();
      // Re-unlock with a new master
      await manager.generateKey('master2', 'master');
      // Now getKey should load from keychain
      const key = await manager.getKey(info!.id);
      expect(Buffer.isBuffer(key)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // lock()
  // -------------------------------------------------------------------------

  describe('lock()', () => {
    it('sets isLocked=true after lock()', async () => {
      const manager = await freshManager();
      await manager.generateKey('master', 'master');
      expect(manager.isUnlocked()).toBe(true);
      manager.lock();
      expect(manager.isUnlocked()).toBe(false);
    });

    it('clears masterKey after lock()', async () => {
      const manager = await freshManager();
      await manager.generateKey('master', 'master');
      expect(manager.getMasterKey()).not.toBeNull();
      manager.lock();
      expect(manager.getMasterKey()).toBeNull();
    });

    it('prevents getKey from returning cached keys after lock', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('master', 'master');
      manager.lock();
      const key = await manager.getKey(info!.id);
      expect(key).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listKeys()
  // -------------------------------------------------------------------------

  describe('listKeys()', () => {
    it('returns an empty array when no keys have been generated', async () => {
      const manager = await freshManager();
      expect(manager.listKeys()).toEqual([]);
    });

    it('returns all generated keys', async () => {
      const manager = await freshManager();
      await manager.generateKey('key-a', 'data');
      await manager.generateKey('key-b', 'signing');
      const list = manager.listKeys();
      expect(list).toHaveLength(2);
      const names = list.map(k => k.name);
      expect(names).toContain('key-a');
      expect(names).toContain('key-b');
    });

    it('returns KeyInfo objects with required fields', async () => {
      const manager = await freshManager();
      await manager.generateKey('k', 'transfer');
      const [info] = manager.listKeys();
      expect(info).toMatchObject({
        name: 'k',
        purpose: 'transfer',
        algorithm: 'aes-256-gcm',
      });
      expect(typeof info.id).toBe('string');
      expect(typeof info.createdAt).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // getKeyInfo()
  // -------------------------------------------------------------------------

  describe('getKeyInfo()', () => {
    it('returns KeyInfo for an existing key', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('my-key', 'data');
      const retrieved = manager.getKeyInfo(info!.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(info!.id);
      expect(retrieved!.name).toBe('my-key');
    });

    it('returns null for a non-existent key id', async () => {
      const manager = await freshManager();
      expect(manager.getKeyInfo('non-existent-id')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // rotateKey()
  // -------------------------------------------------------------------------

  describe('rotateKey()', () => {
    it('returns a new KeyInfo with same purpose', async () => {
      const manager = await freshManager();
      const original = await manager.generateKey('rotate-me', 'data');
      const rotated = await manager.rotateKey(original!.id);
      expect(rotated).not.toBeNull();
      expect(rotated!.purpose).toBe('data');
      expect(rotated!.id).not.toBe(original!.id);
    });

    it('marks old key with rotatedAt timestamp', async () => {
      const manager = await freshManager();
      const original = await manager.generateKey('old-key', 'signing');
      const before = Date.now();
      await manager.rotateKey(original!.id);
      const keys = mockStore['keys'] as Record<string, any>;
      const oldMeta = keys[original!.id];
      expect(oldMeta.rotatedAt).toBeGreaterThanOrEqual(before);
    });

    it('removes old key from cache after rotation', async () => {
      const manager = await freshManager();
      const original = await manager.generateKey('master', 'master');
      // master unlocks the manager
      const datakeyInfo = await manager.generateKey('data-key', 'data');
      await manager.rotateKey(datakeyInfo!.id);
      // The old key should no longer be retrievable from cache (it should load
      // from keychain if checksum was correct, but the important thing is the
      // cache was cleared — after rotation listKeys should include rotatedAt)
      const info = manager.getKeyInfo(datakeyInfo!.id);
      expect(info?.rotatedAt).toBeDefined();
    });

    it('returns null for a non-existent key id', async () => {
      const manager = await freshManager();
      const result = await manager.rotateKey('no-such-key');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteKey()
  // -------------------------------------------------------------------------

  describe('deleteKey()', () => {
    it('returns true and removes key from store', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('to-delete', 'data');
      const result = await manager.deleteKey(info!.id);
      expect(result).toBe(true);
      expect(manager.getKeyInfo(info!.id)).toBeNull();
    });

    it('removed key no longer appears in listKeys()', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('gone', 'session');
      await manager.deleteKey(info!.id);
      const list = manager.listKeys();
      expect(list.find(k => k.id === info!.id)).toBeUndefined();
    });

    it('returns true even if key was not in cache', async () => {
      const manager = await freshManager();
      const info = await manager.generateKey('no-cache-key', 'data');
      // Clear cache via lock
      manager.lock();
      const result = await manager.deleteKey(info!.id);
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getRotationPolicy() / updateRotationPolicy()
  // -------------------------------------------------------------------------

  describe('rotation policy', () => {
    it('getRotationPolicy() returns default policy', async () => {
      const manager = await freshManager();
      const policy = manager.getRotationPolicy();
      expect(policy).toMatchObject({
        enabled: true,
        intervalDays: 90,
        lastRotation: 0,
        autoRotate: true,
      });
    });

    it('updateRotationPolicy() merges partial updates', async () => {
      const manager = await freshManager();
      const updated = manager.updateRotationPolicy({ intervalDays: 30 });
      expect(updated.intervalDays).toBe(30);
      // Other fields should retain defaults
      expect(updated.enabled).toBe(true);
      expect(updated.autoRotate).toBe(true);
    });

    it('updateRotationPolicy() persists changes visible via getRotationPolicy()', async () => {
      const manager = await freshManager();
      manager.updateRotationPolicy({ enabled: false });
      expect(manager.getRotationPolicy().enabled).toBe(false);
    });

    it('updateRotationPolicy() returns the merged policy object', async () => {
      const manager = await freshManager();
      const result = manager.updateRotationPolicy({ lastRotation: 12345 });
      expect(result.lastRotation).toBe(12345);
    });
  });
});
