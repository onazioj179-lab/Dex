// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// @vitest-environment node

/**
 * ===========================================================================
 * DEX - IPCCrypto Tests
 * ===========================================================================
 *
 * Unit tests for the IPC envelope encryption module that protects sensitive
 * IPC payloads with per-session AES-256-GCM.
 *
 * Uses real Node crypto — only electron is mocked.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron (ipcMain.handle) before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// ---------------------------------------------------------------------------
// We re-import per test to get a fresh IPCCrypto singleton (sessionKey = null)
// ---------------------------------------------------------------------------

import type { SealedEnvelope } from '../../src/main/security/IPCCrypto';

let IPCCrypto: typeof import('../../src/main/security/IPCCrypto')['IPCCrypto'];

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../../src/main/security/IPCCrypto');
  IPCCrypto = mod.IPCCrypto;
});

afterEach(() => {
  // Ensure key is wiped even if a test fails partway through
  try { IPCCrypto.destroy(); } catch { /* ignore */ }
});

// ===========================================================================
// Tests
// ===========================================================================

describe('IPCCrypto', () => {
  // -------------------------------------------------------------------------
  // 1. init() generates a session key
  // -------------------------------------------------------------------------
  describe('init()', () => {
    it('generates a session key and registers the IPC handler', async () => {
      const { ipcMain } = await import('electron');

      IPCCrypto.init();

      // After init, getSessionKeyForPreload should not throw
      expect(() => IPCCrypto.getSessionKeyForPreload()).not.toThrow();

      // ipcMain.handle should have been called for the key-delivery channel
      expect(ipcMain.handle).toHaveBeenCalledWith(
        'ipc-crypto:getSessionKey',
        expect.any(Function),
      );
    });

    it('session key is a 32-byte Buffer', () => {
      IPCCrypto.init();
      const key = IPCCrypto.getSessionKeyForPreload();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });
  });

  // -------------------------------------------------------------------------
  // 2. seal/open round-trip preserves plaintext
  // -------------------------------------------------------------------------
  describe('seal/open round-trip', () => {
    it('recovers the original plaintext', () => {
      IPCCrypto.init();
      const plaintext = 'Hello, DEX secure channel!';

      const envelope = IPCCrypto.seal(plaintext);
      const recovered = IPCCrypto.open(envelope);

      expect(recovered).toBe(plaintext);
    });

    it('handles empty string — seal succeeds but open rejects empty ct', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('');
      // AES-256-GCM encrypting an empty plaintext yields empty ciphertext,
      // which base64-encodes to "" (falsy). The open() validation rejects
      // falsy ct via `!envelope.ct`, so this is a known edge case.
      expect(envelope.ct).toBe('');
      expect(() => IPCCrypto.open(envelope)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('handles unicode and emoji', () => {
      IPCCrypto.init();
      const text = 'DEX — encryption ✨ \u{1F510}\u{1F512}';
      const envelope = IPCCrypto.seal(text);
      expect(IPCCrypto.open(envelope)).toBe(text);
    });

    it('handles large payloads', () => {
      IPCCrypto.init();
      const large = 'x'.repeat(100_000);
      const envelope = IPCCrypto.seal(large);
      expect(IPCCrypto.open(envelope)).toBe(large);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Each seal produces different IV (different ciphertext)
  // -------------------------------------------------------------------------
  describe('IV uniqueness', () => {
    it('two seals of the same plaintext produce different IVs', () => {
      IPCCrypto.init();
      const plaintext = 'same input twice';

      const env1 = IPCCrypto.seal(plaintext);
      const env2 = IPCCrypto.seal(plaintext);

      expect(env1.iv).not.toBe(env2.iv);
    });

    it('two seals of the same plaintext produce different ciphertexts', () => {
      IPCCrypto.init();
      const plaintext = 'same input twice';

      const env1 = IPCCrypto.seal(plaintext);
      const env2 = IPCCrypto.seal(plaintext);

      expect(env1.ct).not.toBe(env2.ct);
    });
  });

  // -------------------------------------------------------------------------
  // 4. open() rejects tampered ciphertext
  // -------------------------------------------------------------------------
  describe('tampered ciphertext rejection', () => {
    it('throws when ciphertext bytes are modified', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('secret data');

      // Tamper with the ciphertext
      const ctBuf = Buffer.from(envelope.ct, 'base64');
      ctBuf[0] ^= 0xff; // flip bits in first byte
      const tampered: SealedEnvelope = {
        ...envelope,
        ct: ctBuf.toString('base64'),
      };

      expect(() => IPCCrypto.open(tampered)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 5. open() rejects tampered auth tag
  // -------------------------------------------------------------------------
  describe('tampered auth tag rejection', () => {
    it('throws when the auth tag is modified', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('protected');

      // Tamper with the auth tag
      const tagBuf = Buffer.from(envelope.tag, 'base64');
      tagBuf[0] ^= 0xff;
      const tampered: SealedEnvelope = {
        ...envelope,
        tag: tagBuf.toString('base64'),
      };

      expect(() => IPCCrypto.open(tampered)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 6. open() rejects invalid envelope format
  // -------------------------------------------------------------------------
  describe('invalid envelope format', () => {
    it('throws on null envelope', () => {
      IPCCrypto.init();
      expect(() => IPCCrypto.open(null as any)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('throws on undefined envelope', () => {
      IPCCrypto.init();
      expect(() => IPCCrypto.open(undefined as any)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('throws when version is wrong', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('test');
      const bad = { ...envelope, v: 2 as any };
      expect(() => IPCCrypto.open(bad)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('throws when iv is missing', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('test');
      const bad = { ...envelope, iv: '' };
      expect(() => IPCCrypto.open(bad)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('throws when tag is missing', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('test');
      const bad = { ...envelope, tag: '' };
      expect(() => IPCCrypto.open(bad)).toThrow('[IPCCrypto] Invalid envelope format');
    });

    it('throws when ct is missing', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('test');
      const bad = { ...envelope, ct: '' };
      expect(() => IPCCrypto.open(bad)).toThrow('[IPCCrypto] Invalid envelope format');
    });
  });

  // -------------------------------------------------------------------------
  // 7. seal/open throw before init()
  // -------------------------------------------------------------------------
  describe('operations before init()', () => {
    it('seal() throws before init', () => {
      expect(() => IPCCrypto.seal('test')).toThrow('[IPCCrypto] Session key not initialized');
    });

    it('open() throws before init', () => {
      const fakeEnvelope: SealedEnvelope = {
        v: 1,
        iv: 'AAAA',
        tag: 'BBBB',
        ct: 'CCCC',
      };
      expect(() => IPCCrypto.open(fakeEnvelope)).toThrow('[IPCCrypto] Session key not initialized');
    });

    it('getSessionKeyForPreload() throws before init', () => {
      expect(() => IPCCrypto.getSessionKeyForPreload()).toThrow(
        '[IPCCrypto] Session key not initialized',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. destroy() wipes key; subsequent seal/open throw
  // -------------------------------------------------------------------------
  describe('destroy()', () => {
    it('wipes the session key from memory', () => {
      IPCCrypto.init();
      const keyBefore = IPCCrypto.getSessionKeyForPreload();
      expect(keyBefore.length).toBe(32);

      IPCCrypto.destroy();

      expect(() => IPCCrypto.getSessionKeyForPreload()).toThrow(
        '[IPCCrypto] Session key not initialized',
      );
    });

    it('seal() throws after destroy', () => {
      IPCCrypto.init();
      IPCCrypto.destroy();

      expect(() => IPCCrypto.seal('test')).toThrow('[IPCCrypto] Session key not initialized');
    });

    it('open() throws after destroy', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('test');
      IPCCrypto.destroy();

      expect(() => IPCCrypto.open(envelope)).toThrow('[IPCCrypto] Session key not initialized');
    });

    it('calling destroy() twice does not throw', () => {
      IPCCrypto.init();
      IPCCrypto.destroy();
      expect(() => IPCCrypto.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 9. getSessionKeyForPreload() returns a Buffer copy (not the same ref)
  // -------------------------------------------------------------------------
  describe('getSessionKeyForPreload()', () => {
    it('returns a Buffer', () => {
      IPCCrypto.init();
      const key = IPCCrypto.getSessionKeyForPreload();
      expect(Buffer.isBuffer(key)).toBe(true);
    });

    it('returns a copy — mutating it does not affect seal/open', () => {
      IPCCrypto.init();
      const plaintext = 'verify copy isolation';

      // Get the key and corrupt it
      const keyCopy = IPCCrypto.getSessionKeyForPreload();
      keyCopy.fill(0);

      // seal/open should still work because the internal key is untouched
      const envelope = IPCCrypto.seal(plaintext);
      expect(IPCCrypto.open(envelope)).toBe(plaintext);
    });

    it('successive calls return equal but distinct buffers', () => {
      IPCCrypto.init();
      const k1 = IPCCrypto.getSessionKeyForPreload();
      const k2 = IPCCrypto.getSessionKeyForPreload();

      expect(k1.equals(k2)).toBe(true);
      // They should be different Buffer instances (copies)
      expect(k1).not.toBe(k2);
    });
  });

  // -------------------------------------------------------------------------
  // 10. tryOpen() returns null on failure instead of throwing
  // -------------------------------------------------------------------------
  describe('tryOpen()', () => {
    it('returns plaintext on valid envelope', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('safe payload');
      expect(IPCCrypto.tryOpen(envelope)).toBe('safe payload');
    });

    it('returns null on tampered ciphertext', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('will tamper');

      const ctBuf = Buffer.from(envelope.ct, 'base64');
      ctBuf[0] ^= 0xff;
      const tampered = { ...envelope, ct: ctBuf.toString('base64') };

      expect(IPCCrypto.tryOpen(tampered)).toBeNull();
    });

    it('returns null on invalid envelope format', () => {
      IPCCrypto.init();
      expect(IPCCrypto.tryOpen(null)).toBeNull();
      expect(IPCCrypto.tryOpen(undefined)).toBeNull();
      expect(IPCCrypto.tryOpen({})).toBeNull();
      expect(IPCCrypto.tryOpen('not an object')).toBeNull();
    });

    it('returns null when session key is not initialized', () => {
      // Don't call init() — key is null
      const fakeEnvelope = { v: 1, iv: 'x', tag: 'y', ct: 'z' };
      expect(IPCCrypto.tryOpen(fakeEnvelope)).toBeNull();
    });

    it('does not throw even on completely garbage input', () => {
      IPCCrypto.init();
      expect(() => IPCCrypto.tryOpen({ v: 1, iv: '!!!', tag: '???', ct: '###' })).not.toThrow();
      expect(IPCCrypto.tryOpen({ v: 1, iv: '!!!', tag: '???', ct: '###' })).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Sealed envelope structure
  // -------------------------------------------------------------------------
  describe('envelope structure', () => {
    it('seal() returns an object with v, iv, tag, ct fields', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('check structure');

      expect(envelope).toHaveProperty('v', 1);
      expect(envelope).toHaveProperty('iv');
      expect(envelope).toHaveProperty('tag');
      expect(envelope).toHaveProperty('ct');
      expect(typeof envelope.iv).toBe('string');
      expect(typeof envelope.tag).toBe('string');
      expect(typeof envelope.ct).toBe('string');
    });

    it('iv, tag, ct are valid base64 strings', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('base64 check');

      const b64regex = /^[A-Za-z0-9+/]+=*$/;
      expect(envelope.iv).toMatch(b64regex);
      expect(envelope.tag).toMatch(b64regex);
      expect(envelope.ct).toMatch(b64regex);
    });

    it('iv is 12 bytes (96 bits) when decoded', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('iv length');
      const ivBuf = Buffer.from(envelope.iv, 'base64');
      expect(ivBuf.length).toBe(12);
    });

    it('tag is 16 bytes (128 bits) when decoded', () => {
      IPCCrypto.init();
      const envelope = IPCCrypto.seal('tag length');
      const tagBuf = Buffer.from(envelope.tag, 'base64');
      expect(tagBuf.length).toBe(16);
    });
  });
});
