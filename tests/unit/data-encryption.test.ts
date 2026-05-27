// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

/**
 * DataEncryption tests
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import of the module under test
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
}));

const fsMockFiles = new Map<string, Buffer | string>();

vi.mock('fs', () => {
  const actual = vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    readFileSync: vi.fn((p: string, _opts?: unknown) => {
      if (fsMockFiles.has(p)) return fsMockFiles.get(p);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
    writeFileSync: vi.fn((p: string, data: Buffer | string, _opts?: unknown) => {
      fsMockFiles.set(p, data);
    }),
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn((p: string, _opts?: unknown) => {
        if (fsMockFiles.has(p)) return Promise.resolve(fsMockFiles.get(p));
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      }),
      writeFile: vi.fn((p: string, data: Buffer | string) => {
        fsMockFiles.set(p, data);
        return Promise.resolve();
      }),
      rename: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('os', () => ({
  hostname: vi.fn().mockReturnValue('mock-host'),
  userInfo: vi.fn().mockReturnValue({ username: 'mock-user' }),
  platform: vi.fn().mockReturnValue('linux'),
  arch: vi.fn().mockReturnValue('x64'),
  cpus: vi.fn().mockReturnValue([{ model: 'Mock CPU v1' }]),
}));

vi.mock('../../src/main/utils/Logger', () => {
  class MockLogger {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    success = vi.fn();
  }
  return { Logger: MockLogger };
});

// Import after mocks are in place
import { DataEncryption } from '../../src/main/security/DataEncryption';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeInitialized(): Promise<DataEncryption> {
  const enc = new DataEncryption();
  await enc.initialize();
  return enc;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataEncryption', () => {
  beforeEach(() => {
    fsMockFiles.clear();
    vi.clearAllMocks();
  });

  // ── 1. encrypt / decrypt round-trip (Buffer and string) ─────────────────
  it('round-trips Buffer data through encrypt/decrypt', async () => {
    const enc = await makeInitialized();
    const original = Buffer.from('hello world — sensitive data 🔒');
    const encrypted = enc.encrypt(original);
    const decrypted = enc.decrypt(encrypted);
    expect(decrypted).toEqual(original);
    await enc.shutdown();
  });

  it('round-trips a string passed to encrypt/decrypt', async () => {
    const enc = await makeInitialized();
    const original = 'plain string input';
    const encrypted = enc.encrypt(original);
    const decrypted = enc.decrypt(encrypted);
    expect(decrypted.toString('utf8')).toBe(original);
    await enc.shutdown();
  });

  // ── 2. encryptString / decryptString round-trip ─────────────────────────
  it('round-trips through encryptString/decryptString', async () => {
    const enc = await makeInitialized();
    const text = 'The quick brown fox jumps over the lazy dog';
    const cipher = enc.encryptString(text);
    expect(typeof cipher).toBe('string'); // base64
    const plain = enc.decryptString(cipher);
    expect(plain).toBe(text);
    await enc.shutdown();
  });

  // ── 3. encryptJSON / decryptJSON round-trip ─────────────────────────────
  it('round-trips JSON through encryptJSON/decryptJSON', async () => {
    const enc = await makeInitialized();
    const obj = { user: 'alice', tokens: [1, 2, 3], nested: { ok: true } };
    const cipher = enc.encryptJSON(obj);
    const result = enc.decryptJSON(cipher);
    expect(result).toEqual(obj);
    await enc.shutdown();
  });

  // ── 4. isEncrypted detects encrypted data ───────────────────────────────
  it('isEncrypted returns true for data produced by encrypt', async () => {
    const enc = await makeInitialized();
    const encrypted = enc.encrypt(Buffer.from('test'));
    expect(enc.isEncrypted(encrypted)).toBe(true);
    await enc.shutdown();
  });

  // ── 5. isEncrypted returns false for plain data ─────────────────────────
  it('isEncrypted returns false for plain data', async () => {
    const enc = await makeInitialized();
    expect(enc.isEncrypted(Buffer.from('not encrypted'))).toBe(false);
    expect(enc.isEncrypted(Buffer.alloc(0))).toBe(false);
    expect(enc.isEncrypted(Buffer.from('DEXENC0'))).toBe(false); // 7 bytes, too short
    await enc.shutdown();
  });

  // ── 6. decrypt returns unencrypted data as-is (backward compatibility) ──
  it('decrypt returns non-encrypted data unchanged', async () => {
    const enc = await makeInitialized();
    const plain = Buffer.from('legacy unencrypted data');
    const result = enc.decrypt(plain);
    expect(result).toEqual(plain);
    await enc.shutdown();
  });

  // ── 7. Each encryption produces different ciphertext (per-record IV) ────
  it('encrypting the same plaintext twice produces different ciphertext', async () => {
    const enc = await makeInitialized();
    const data = Buffer.from('deterministic input');
    const a = enc.encrypt(data);
    const b = enc.encrypt(data);
    expect(a.equals(b)).toBe(false);
    // But both decrypt to the same value
    expect(enc.decrypt(a)).toEqual(data);
    expect(enc.decrypt(b)).toEqual(data);
    await enc.shutdown();
  });

  // ── 8. Tampered ciphertext throws on decrypt ───────────────────────────
  it('throws when ciphertext has been tampered with', async () => {
    const enc = await makeInitialized();
    const encrypted = enc.encrypt(Buffer.from('secret'));

    // Tamper with the encrypted payload (last byte)
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => enc.decrypt(tampered)).toThrow();
    await enc.shutdown();
  });

  // ── 9. encrypt/decrypt throw before initialize() ───────────────────────
  it('encrypt throws when not initialized', () => {
    const enc = new DataEncryption();
    expect(() => enc.encrypt(Buffer.from('data'))).toThrow('Encryption not initialized');
  });

  it('decrypt throws when not initialized', () => {
    const enc = new DataEncryption();
    // Build a buffer that starts with the DEXENC01 header so the code path
    // that checks the key is reached (otherwise decrypt returns data as-is).
    const fakeEncrypted = Buffer.concat([
      Buffer.from('DEXENC01'),
      Buffer.alloc(32 + 16), // IV + authTag + some data
    ]);
    expect(() => enc.decrypt(fakeEncrypted)).toThrow('Encryption not initialized');
  });

  // ── 10. shutdown wipes key ─────────────────────────────────────────────
  it('shutdown wipes the key so subsequent encrypt calls throw', async () => {
    const enc = await makeInitialized();
    // Verify encryption works before shutdown
    enc.encrypt(Buffer.from('ok'));
    await enc.shutdown();
    expect(() => enc.encrypt(Buffer.from('should fail'))).toThrow('Encryption not initialized');
  });
});
