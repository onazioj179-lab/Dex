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
// IPC handler capture
// ---------------------------------------------------------------------------

const ipcHandlers = new Map<string, Function>();

let mockVaultFileExists = false;
let mockVaultFileData: Buffer | null = null;

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  clipboard: {
    writeText: vi.fn(),
    readText: vi.fn(() => ''),
    clear: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => mockVaultFileExists),
  readFileSync: vi.fn(() => mockVaultFileData),
  writeFileSync: vi.fn((path: string, data: Buffer) => {
    mockVaultFileData = data;
    mockVaultFileExists = true;
  }),
}));

vi.mock('../../src/main/security/IPCCrypto', () => ({
  IPCCrypto: {
    open: vi.fn((sealed: any) => {
      if (typeof sealed === 'string') return sealed;
      return sealed?.data ?? sealed;
    }),
    seal: vi.fn((data: any) => ({ data })),
    init: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultController', () => {
  let VaultController: any;
  let controller: any;
  const fakeEvent = { sender: { id: 1 } } as any;

  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    mockVaultFileExists = false;
    mockVaultFileData = null;

    // Re-apply mocks after resetModules
    vi.mock('electron', () => ({
      app: { getPath: vi.fn(() => '/mock/userData') },
      ipcMain: {
        handle: vi.fn((channel: string, handler: Function) => {
          ipcHandlers.set(channel, handler);
        }),
        on: vi.fn(),
        removeHandler: vi.fn(),
      },
      BrowserWindow: { getAllWindows: vi.fn(() => []) },
      clipboard: { writeText: vi.fn(), readText: vi.fn(() => ''), clear: vi.fn() },
      safeStorage: { isEncryptionAvailable: vi.fn(() => true) },
    }));

    const mod = await import('../../src/main/controllers/VaultController');
    VaultController = mod.VaultController;
    controller = new VaultController();
  });

  describe('IPC handler registration', () => {
    it('registers vault:exists handler', () => {
      expect(ipcHandlers.has('vault:exists')).toBe(true);
    });

    it('registers vault:isUnlocked handler', () => {
      expect(ipcHandlers.has('vault:isUnlocked')).toBe(true);
    });

    it('registers vault:create handler', () => {
      expect(ipcHandlers.has('vault:create')).toBe(true);
    });

    it('registers vault:unlock handler', () => {
      expect(ipcHandlers.has('vault:unlock')).toBe(true);
    });

    it('registers vault:lock handler', () => {
      expect(ipcHandlers.has('vault:lock')).toBe(true);
    });

    it('registers vault:getCredentials handler', () => {
      expect(ipcHandlers.has('vault:getCredentials')).toBe(true);
    });

    it('registers vault:generatePassword handler', () => {
      expect(ipcHandlers.has('vault:generatePassword')).toBe(true);
    });

    it('registers vault:getSettings handler', () => {
      expect(ipcHandlers.has('vault:getSettings')).toBe(true);
    });

    it('registers vault:auditPasswords handler', () => {
      expect(ipcHandlers.has('vault:auditPasswords')).toBe(true);
    });
  });

  describe('vault:exists', () => {
    it('returns false when no vault file', async () => {
      const result = await ipcHandlers.get('vault:exists')!(fakeEvent);
      expect(result).toBe(false);
    });

    it('returns true when vault file exists', async () => {
      mockVaultFileExists = true;
      const result = await ipcHandlers.get('vault:exists')!(fakeEvent);
      expect(result).toBe(true);
    });
  });

  describe('vault:isUnlocked', () => {
    it('returns false initially', async () => {
      const result = await ipcHandlers.get('vault:isUnlocked')!(fakeEvent);
      expect(result).toBe(false);
    });
  });

  describe('vault:create', () => {
    it('creates vault with valid password', async () => {
      const result = await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      expect(result.success).toBe(true);
    });

    it('vault is unlocked after creation', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const unlocked = await ipcHandlers.get('vault:isUnlocked')!(fakeEvent);
      expect(unlocked).toBe(true);
    });

    it('rejects short password (< 8 chars)', async () => {
      const result = await ipcHandlers.get('vault:create')!(fakeEvent, 'short');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/8 characters/i);
    });

    it('rejects creation when vault already exists', async () => {
      mockVaultFileExists = true;
      const result = await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already exists/i);
    });

    it('vault file is written after creation', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      expect(mockVaultFileData).not.toBeNull();
      expect(mockVaultFileData!.length).toBeGreaterThan(64);
    });
  });

  describe('vault:lock', () => {
    it('locks the vault', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      await ipcHandlers.get('vault:lock')!(fakeEvent);
      const unlocked = await ipcHandlers.get('vault:isUnlocked')!(fakeEvent);
      expect(unlocked).toBe(false);
    });
  });

  describe('vault:getCredentials', () => {
    it('returns empty array when locked', async () => {
      const result = await ipcHandlers.get('vault:getCredentials')!(fakeEvent);
      expect(result).toEqual([]);
    });

    it('returns empty array after creation (no credentials yet)', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const result = await ipcHandlers.get('vault:getCredentials')!(fakeEvent);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('vault:addCredential', () => {
    it('fails when vault is locked', async () => {
      const result = await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitHub', username: 'dev' })
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/locked/i);
    });

    it('adds credential when unlocked', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const result = await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitHub', username: 'dev', password: 'secret123' })
      );
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });

    it('credentials list includes new entry', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitHub', username: 'dev' })
      );
      const creds = await ipcHandlers.get('vault:getCredentials')!(fakeEvent);
      expect(creds).toHaveLength(1);
      expect(creds[0].title).toBe('GitHub');
    });

    it('does not expose password in list', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitHub', password: 'topsecret' })
      );
      const creds = await ipcHandlers.get('vault:getCredentials')!(fakeEvent);
      expect(creds[0].password).toBeUndefined();
    });
  });

  describe('vault:deleteCredential', () => {
    it('fails when locked', async () => {
      const result = await ipcHandlers.get('vault:deleteCredential')!(fakeEvent, 'nonexistent');
      expect(result.success).toBe(false);
    });

    it('deletes existing credential', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const addResult = await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'Test' })
      );
      const deleteResult = await ipcHandlers.get('vault:deleteCredential')!(fakeEvent, addResult.id);
      expect(deleteResult.success).toBe(true);
      const creds = await ipcHandlers.get('vault:getCredentials')!(fakeEvent);
      expect(creds).toHaveLength(0);
    });

    it('returns error for unknown id', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const result = await ipcHandlers.get('vault:deleteCredential')!(fakeEvent, 'unknown-id');
      expect(result.success).toBe(false);
    });
  });

  describe('vault:generatePassword', () => {
    it('returns a string', async () => {
      const pw = await ipcHandlers.get('vault:generatePassword')!(fakeEvent);
      expect(typeof pw).toBe('string');
    });

    it('has correct default length (20)', async () => {
      const pw = await ipcHandlers.get('vault:generatePassword')!(fakeEvent);
      expect(pw.length).toBe(20);
    });

    it('generates different passwords each call', async () => {
      const pw1 = await ipcHandlers.get('vault:generatePassword')!(fakeEvent);
      const pw2 = await ipcHandlers.get('vault:generatePassword')!(fakeEvent);
      expect(pw1).not.toBe(pw2);
    });
  });

  describe('vault:getSettings', () => {
    it('returns default settings when locked', async () => {
      const settings = await ipcHandlers.get('vault:getSettings')!(fakeEvent);
      expect(settings.autoLockMinutes).toBe(15);
      expect(settings.clipboardClearSeconds).toBe(30);
      expect(settings.passwordGeneratorLength).toBe(20);
    });
  });

  describe('vault:getCategories', () => {
    it('returns default categories when locked', async () => {
      const cats = await ipcHandlers.get('vault:getCategories')!(fakeEvent);
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
      expect(cats.some((c: any) => c.id === 'work')).toBe(true);
      expect(cats.some((c: any) => c.id === 'personal')).toBe(true);
    });
  });

  describe('vault:getAuthenticators', () => {
    it('returns empty array when locked', async () => {
      const result = await ipcHandlers.get('vault:getAuthenticators')!(fakeEvent);
      expect(result).toEqual([]);
    });

    it('returns empty array after creation (no authenticators yet)', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const result = await ipcHandlers.get('vault:getAuthenticators')!(fakeEvent);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('vault:auditPasswords', () => {
    it('returns empty audit when locked', async () => {
      const audit = await ipcHandlers.get('vault:auditPasswords')!(fakeEvent);
      expect(audit.weak).toEqual([]);
      expect(audit.reused).toEqual([]);
      expect(audit.old).toEqual([]);
    });

    it('detects weak passwords', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'Weak', password: 'abc' })
      );
      const audit = await ipcHandlers.get('vault:auditPasswords')!(fakeEvent);
      expect(audit.weak.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('vault:searchCredentials', () => {
    it('returns empty when locked', async () => {
      const result = await ipcHandlers.get('vault:searchCredentials')!(fakeEvent, 'github');
      expect(result).toEqual([]);
    });

    it('finds matching credentials by title', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitHub', username: 'developer' })
      );
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'GitLab', username: 'developer' })
      );
      await ipcHandlers.get('vault:addCredential')!(
        fakeEvent,
        JSON.stringify({ title: 'Netflix', username: 'user' })
      );
      const result = await ipcHandlers.get('vault:searchCredentials')!(fakeEvent, 'git');
      expect(result).toHaveLength(2);
    });
  });

  describe('vault:updateSettings', () => {
    it('fails when locked', async () => {
      const result = await ipcHandlers.get('vault:updateSettings')!(fakeEvent, { autoLockMinutes: 30 });
      expect(result.success).toBe(false);
    });

    it('updates settings when unlocked', async () => {
      await ipcHandlers.get('vault:create')!(fakeEvent, 'StrongPass123!');
      const result = await ipcHandlers.get('vault:updateSettings')!(fakeEvent, { autoLockMinutes: 30 });
      expect(result.success).toBe(true);
      const settings = await ipcHandlers.get('vault:getSettings')!(fakeEvent);
      expect(settings.autoLockMinutes).toBe(30);
    });
  });
});
