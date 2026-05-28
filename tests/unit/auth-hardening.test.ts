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

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    on: vi.fn(),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('enc:', '')),
  },
  systemPreferences: {
    canPromptTouchID: vi.fn(() => false),
    promptTouchID: vi.fn(),
  },
  powerMonitor: { on: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('not found'))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

let AuthHardeningClass: any;

describe('AuthHardening', () => {
  let auth: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../src/main/security/AuthHardening');
    AuthHardeningClass = mod;
    auth = (mod as any).authHardening;
  });

  describe('password validation', () => {
    it('rejects passwords shorter than minimum length', () => {
      const result = auth.validatePassword('short');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e: string) => e.includes('12 characters'))).toBe(true);
    });

    it('requires uppercase when configured', () => {
      const result = auth.validatePassword('abcdefghijklmnop1');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('uppercase'))).toBe(true);
    });

    it('requires lowercase when configured', () => {
      const result = auth.validatePassword('ABCDEFGHIJKLMNOP1');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('lowercase'))).toBe(true);
    });

    it('requires numbers when configured', () => {
      const result = auth.validatePassword('AbcdefghijklmnoP');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('number'))).toBe(true);
    });

    it('rejects common passwords', () => {
      const result = auth.validatePassword('password');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('common'))).toBe(true);
    });

    it('accepts a strong password', () => {
      const result = auth.validatePassword('Xk9!mPqR7zLwV2nJ');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('password strength', () => {
    it('rates short all-lowercase as weak', () => {
      const result = auth.calculatePasswordStrength('abc');
      expect(result.level).toBe('weak');
      expect(result.score).toBeLessThan(20);
    });

    it('rates a long diverse password as strong or excellent', () => {
      const result = auth.calculatePasswordStrength('Jv7!xN3@hB9#mT2$');
      expect(['strong', 'excellent']).toContain(result.level);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });

    it('penalizes repetitive characters', () => {
      const repetitive = auth.calculatePasswordStrength('aaaaaaaaAAAAAAAA1!');
      const diverse = auth.calculatePasswordStrength('abcdefghABCDEFGH1!');
      expect(repetitive.score).toBeLessThan(diverse.score);
    });

    it('detects common patterns', () => {
      const result = auth.calculatePasswordStrength('abcdef123456AAAA');
      expect(result.feedback.some((f: string) => f.includes('pattern'))).toBe(true);
    });

    it('provides crack time estimate', () => {
      const result = auth.calculatePasswordStrength('Jv7!xN3@hB9#mT2$');
      expect(result.estimatedCrackTime).toBeDefined();
      expect(typeof result.estimatedCrackTime).toBe('string');
    });
  });

  describe('PIN validation', () => {
    it('rejects PIN with wrong length', () => {
      const result = auth.validatePIN('1234');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('6 digits'))).toBe(true);
    });

    it('rejects non-digit PINs', () => {
      const result = auth.validatePIN('12345a');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('digits'))).toBe(true);
    });

    it('rejects PINs with too many repeating digits', () => {
      const result = auth.validatePIN('111456');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('repeating'))).toBe(true);
    });

    it('rejects sequential PINs', () => {
      const result = auth.validatePIN('123456');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('sequential'))).toBe(true);
    });

    it('rejects common PINs', () => {
      const result = auth.validatePIN('000000');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('common'))).toBe(true);
    });

    it('accepts a valid PIN', () => {
      const result = auth.validatePIN('847295');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects descending sequential patterns', () => {
      const result = auth.validatePIN('987654');
      expect(result.valid).toBe(false);
    });
  });

  describe('session management', () => {
    it('creates a session with valid token', () => {
      const session = auth.createSession('password');
      expect(session.id).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.token.length).toBeGreaterThan(0);
      expect(session.isValid).toBe(true);
      expect(session.authMethod).toBe('password');
    });

    it('session has expiry time', () => {
      const session = auth.createSession('password');
      expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    });

    it('biometric session records biometric verification time', () => {
      const session = auth.createSession('biometric');
      expect(session.biometricVerifiedAt).toBeDefined();
      expect(session.biometricVerifiedAt).toBeGreaterThan(0);
    });

    it('password+biometric session records biometric verification time', () => {
      const session = auth.createSession('password+biometric');
      expect(session.biometricVerifiedAt).toBeDefined();
    });

    it('validates correct token', () => {
      const session = auth.createSession('password');
      const result = auth.validateSession(session.token);
      expect(result.valid).toBe(true);
    });

    it('rejects wrong token', () => {
      auth.createSession('password');
      const result = auth.validateSession('wrong-token');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('rejects when no session exists', () => {
      const result = auth.validateSession('any-token');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('No active session');
    });
  });
});
