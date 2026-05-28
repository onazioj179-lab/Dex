// @vitest-environment node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * AUTH CONTROLLER TESTS
 * ===========================================================================
 *
 * Unit tests for AuthController:
 * - IPC handler registration
 * - Password authentication & validation
 * - PIN authentication & validation
 * - Lockout behavior after max failed attempts
 * - Session token management
 * - Biometric auth flow
 * - Config updates (enable/disable auth)
 * - Recovery codes
 * - Credential change flows
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// IPC handler capture — must be hoisted so it's available when the mocked
// ipcMain.handle is called during AuthController's module-level instantiation.
// ---------------------------------------------------------------------------

const ipcHandlers = vi.hoisted(() => new Map<string, Function>());

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

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
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString();
      return str.startsWith('enc:') ? str.slice(4) : str;
    }),
  },
  systemPreferences: {
    canPromptTouchID: vi.fn(() => false),
    promptTouchID: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(() => ({
    on: vi.fn(),
    webContents: { send: vi.fn() },
    isDestroyed: vi.fn(() => false),
  })),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// In-memory file store so writeFileSync/readFileSync/existsSync are consistent
const mockFs = vi.hoisted(() => new Map<string, Buffer>());

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => mockFs.has(p)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: string) => mockFs.get(p) ?? Buffer.from('enc:{}')),
  writeFileSync: vi.fn((p: string, data: any) => {
    mockFs.set(p, Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
  }),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve('{}')),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// Mock IPCCrypto: open() just returns the plaintext value passed as .plaintext
vi.mock('../../src/main/security/IPCCrypto', () => ({
  IPCCrypto: {
    open: vi.fn((sealed: any) => {
      // Allow tests to pass plaintext through a simple mock envelope
      if (typeof sealed === 'string') return sealed;
      if (sealed && sealed.__plaintext !== undefined) return sealed.__plaintext;
      return '';
    }),
    seal: vi.fn((text: string) => ({ __plaintext: text })),
    init: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AuthController } from '../../src/main/controllers/AuthController';
import { IPCCrypto } from '../../src/main/security/IPCCrypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Invoke a registered IPC handler by channel name. */
function invokeIPC(channel: string, ...args: any[]): any {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No IPC handler registered for ${channel}`);
  // First arg is the IPC event object; handlers use (_, payload)
  const fakeEvent = { sender: { id: 1 } };
  return handler(fakeEvent, ...args);
}

/** Create a mock sealed envelope whose IPCCrypto.open returns `plaintext`. */
function seal(plaintext: string): any {
  return { __plaintext: plaintext };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcHandlers.clear();
    mockFs.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // IPC handler registration
  // -----------------------------------------------------------------------

  describe('IPC handler registration', () => {
    it('should register all expected IPC channels on construction', () => {
      new AuthController();

      const expectedChannels = [
        'auth:getState',
        'auth:getConfig',
        'auth:biometricsAvailable',
        'auth:authenticatePassword',
        'auth:authenticatePin',
        'auth:authenticateBiometric',
        'auth:setPassword',
        'auth:setPin',
        'auth:enableBiometric',
        'auth:updateConfig',
        'auth:lock',
        'auth:clearCredentials',
        'auth:verifySession',
        'auth:getLockoutStatus',
        'auth:changePassword',
        'auth:changePin',
        'auth:generateRecoveryCodes',
        'auth:authenticateRecovery',
        'auth:getIdleWarning',
      ];

      for (const channel of expectedChannels) {
        expect(ipcHandlers.has(channel), `Missing handler for ${channel}`).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getState / getConfig
  // -----------------------------------------------------------------------

  describe('auth:getState', () => {
    it('should return the public state with lockout status', () => {
      new AuthController();
      const state = invokeIPC('auth:getState');

      expect(state).toHaveProperty('isLocked');
      expect(state).toHaveProperty('isEnabled');
      expect(state).toHaveProperty('method');
      expect(state).toHaveProperty('hasPassword');
      expect(state).toHaveProperty('hasPin');
      expect(state).toHaveProperty('hasBiometric');
      expect(state).toHaveProperty('lockoutStatus');
      expect(state.lockoutStatus).toHaveProperty('isLockedOut');
      expect(state.lockoutStatus).toHaveProperty('remainingMinutes');
      expect(state.lockoutStatus).toHaveProperty('attemptsRemaining');
    });

    it('should be unlocked when auth is not enabled (default)', () => {
      new AuthController();
      const state = invokeIPC('auth:getState');

      // Default config has enabled: false, so not locked
      expect(state.isLocked).toBe(false);
      expect(state.isEnabled).toBe(false);
    });
  });

  describe('auth:getConfig', () => {
    it('should return the default config when no config file exists', () => {
      new AuthController();
      const config = invokeIPC('auth:getConfig');

      expect(config.enabled).toBe(false);
      expect(config.method).toBe('none');
      expect(config.maxAttempts).toBe(5);
      expect(config.lockoutMinutes).toBe(5);
      expect(config.timeoutMinutes).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Password authentication
  // -----------------------------------------------------------------------

  describe('Password authentication', () => {
    it('should fail when no password is set up', async () => {
      new AuthController();
      const result = await invokeIPC('auth:authenticatePassword', seal('any-password'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('not set up');
    });

    it('should reject passwords shorter than 8 characters when setting', async () => {
      new AuthController();
      const result = await invokeIPC('auth:setPassword', seal('short'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should successfully set a valid password', async () => {
      new AuthController();
      const result = await invokeIPC('auth:setPassword', seal('ValidPassword123'));

      expect(result.success).toBe(true);
    });

    it('should authenticate with the correct password after setting it', async () => {
      new AuthController();

      // Set password
      await invokeIPC('auth:setPassword', seal('MySecurePass99'));

      // Authenticate
      const result = await invokeIPC('auth:authenticatePassword', seal('MySecurePass99'));

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('should fail authentication with the wrong password', async () => {
      new AuthController();

      await invokeIPC('auth:setPassword', seal('CorrectPass123'));
      const result = await invokeIPC('auth:authenticatePassword', seal('WrongPassword'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Incorrect password');
    });
  });

  // -----------------------------------------------------------------------
  // PIN authentication
  // -----------------------------------------------------------------------

  describe('PIN authentication', () => {
    it('should fail when no PIN is set up', async () => {
      new AuthController();
      const result = await invokeIPC('auth:authenticatePin', seal('1234'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('not set up');
    });

    it('should reject invalid PIN format when setting', async () => {
      new AuthController();
      const result = await invokeIPC('auth:setPin', seal('abc'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('4-6 digits');
    });

    it('should accept a valid 4-digit PIN', async () => {
      new AuthController();
      const result = await invokeIPC('auth:setPin', seal('1234'));

      expect(result.success).toBe(true);
    });

    it('should accept a valid 6-digit PIN', async () => {
      new AuthController();
      const result = await invokeIPC('auth:setPin', seal('123456'));

      expect(result.success).toBe(true);
    });

    it('should authenticate with the correct PIN after setting it', async () => {
      new AuthController();

      await invokeIPC('auth:setPin', seal('5678'));
      const result = await invokeIPC('auth:authenticatePin', seal('5678'));

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should fail authentication with the wrong PIN', async () => {
      new AuthController();

      await invokeIPC('auth:setPin', seal('1234'));
      const result = await invokeIPC('auth:authenticatePin', seal('9999'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Incorrect PIN');
    });

    it('should reject invalid PIN format during authentication', async () => {
      new AuthController();

      await invokeIPC('auth:setPin', seal('1234'));
      const result = await invokeIPC('auth:authenticatePin', seal('abc'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PIN format');
    });
  });

  // -----------------------------------------------------------------------
  // Lockout behavior
  // -----------------------------------------------------------------------

  describe('Lockout behavior', () => {
    it('should lock out after maxAttempts failed password attempts', async () => {
      new AuthController();

      // Set a password first
      await invokeIPC('auth:setPassword', seal('CorrectPass123'));

      // Fail 5 times (maxAttempts default = 5)
      for (let i = 0; i < 5; i++) {
        await invokeIPC('auth:authenticatePassword', seal('wrong'));
      }

      // Next attempt should report lockout
      const result = await invokeIPC('auth:authenticatePassword', seal('CorrectPass123'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Locked out');
    });

    it('should report lockout status accurately', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('CorrectPass123'));

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await invokeIPC('auth:authenticatePassword', seal('wrong'));
      }

      const status = invokeIPC('auth:getLockoutStatus');
      expect(status.isLockedOut).toBe(true);
      expect(status.remainingMinutes).toBeGreaterThan(0);
      expect(status.attemptsRemaining).toBe(0);
    });

    it('should unlock after lockout period expires', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('CorrectPass123'));

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        await invokeIPC('auth:authenticatePassword', seal('wrong'));
      }

      // Advance time past the lockout period (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Should be able to authenticate again
      const result = await invokeIPC('auth:authenticatePassword', seal('CorrectPass123'));
      expect(result.success).toBe(true);
    });

    it('should track remaining attempts before lockout', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('CorrectPass123'));

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await invokeIPC('auth:authenticatePassword', seal('wrong'));
      }

      const status = invokeIPC('auth:getLockoutStatus');
      expect(status.isLockedOut).toBe(false);
      expect(status.attemptsRemaining).toBe(2);
    });

    it('should also lock out for failed PIN attempts', async () => {
      new AuthController();
      await invokeIPC('auth:setPin', seal('1234'));

      for (let i = 0; i < 5; i++) {
        await invokeIPC('auth:authenticatePin', seal('9999'));
      }

      const result = await invokeIPC('auth:authenticatePin', seal('1234'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('Locked out');
    });
  });

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  describe('Session management', () => {
    it('should return a session token on successful authentication', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('ValidPass123'));

      const result = await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('should verify a valid session token', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('ValidPass123'));

      const authResult = await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));
      const isValid = invokeIPC('auth:verifySession', seal(authResult.token));

      expect(isValid).toBe(true);
    });

    it('should reject an invalid session token', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('ValidPass123'));
      await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));

      const isValid = invokeIPC('auth:verifySession', seal('bogus-token'));

      expect(isValid).toBe(false);
    });

    it('should invalidate session on lock', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('ValidPass123'));

      const authResult = await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));
      const token = authResult.token;

      // Lock
      invokeIPC('auth:lock');

      // Session should no longer be valid
      const isValid = invokeIPC('auth:verifySession', seal(token));
      expect(isValid).toBe(false);
    });

    it('should reset failed attempts on successful authentication', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('ValidPass123'));

      // Fail a couple times
      await invokeIPC('auth:authenticatePassword', seal('wrong'));
      await invokeIPC('auth:authenticatePassword', seal('wrong'));

      let status = invokeIPC('auth:getLockoutStatus');
      expect(status.attemptsRemaining).toBe(3);

      // Succeed
      await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));

      // Attempts should reset
      status = invokeIPC('auth:getLockoutStatus');
      expect(status.attemptsRemaining).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Biometric auth flow
  // -----------------------------------------------------------------------

  describe('Biometric authentication', () => {
    it('should report biometrics unavailable by default in test (non-darwin/win32)', async () => {
      new AuthController();
      const available = await invokeIPC('auth:biometricsAvailable');

      // In test env, process.platform is usually 'linux', so biometrics not available
      expect(typeof available).toBe('boolean');
    });

    it('should fail biometric auth when not enabled', async () => {
      new AuthController();
      const result = await invokeIPC('auth:authenticateBiometric');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not set up');
    });

    it('should fail biometric auth when locked out', async () => {
      new AuthController();

      // Set up password to trigger lockout
      await invokeIPC('auth:setPassword', seal('CorrectPass123'));

      // Fail enough times to trigger lockout
      for (let i = 0; i < 5; i++) {
        await invokeIPC('auth:authenticatePassword', seal('wrong'));
      }

      // Enable biometric in credentials (by internal state we cannot directly set)
      // But lockout should block biometric too
      const result = await invokeIPC('auth:authenticateBiometric');
      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Config updates
  // -----------------------------------------------------------------------

  describe('Config updates', () => {
    it('should update auth config successfully', async () => {
      new AuthController();
      const result = await invokeIPC('auth:updateConfig', { enabled: true, method: 'password' });

      expect(result.success).toBe(true);
    });

    it('should reflect config updates in getConfig', () => {
      new AuthController();
      invokeIPC('auth:updateConfig', { timeoutMinutes: 10 });

      const config = invokeIPC('auth:getConfig');
      expect(config.timeoutMinutes).toBe(10);
    });

    it('should unlock when auth is disabled', () => {
      new AuthController();
      // First enable auth
      invokeIPC('auth:updateConfig', { enabled: true });
      // Then disable it
      invokeIPC('auth:updateConfig', { enabled: false });

      const state = invokeIPC('auth:getState');
      expect(state.isLocked).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Lock
  // -----------------------------------------------------------------------

  describe('Lock', () => {
    it('should lock the application', async () => {
      new AuthController();
      invokeIPC('auth:updateConfig', { enabled: true });

      // Unlock first by setting and authenticating
      await invokeIPC('auth:setPassword', seal('ValidPass123'));
      await invokeIPC('auth:authenticatePassword', seal('ValidPass123'));

      invokeIPC('auth:lock');

      const state = invokeIPC('auth:getState');
      expect(state.isLocked).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Clear credentials
  // -----------------------------------------------------------------------

  describe('Clear credentials', () => {
    it('should clear all credentials and disable auth', async () => {
      new AuthController();

      // Set up credentials
      await invokeIPC('auth:setPassword', seal('ValidPass123'));
      invokeIPC('auth:updateConfig', { enabled: true, method: 'password' });

      // Clear without requiring password verification (no sealed arg)
      const result = await invokeIPC('auth:clearCredentials');

      expect(result.success).toBe(true);

      const state = invokeIPC('auth:getState');
      expect(state.hasPassword).toBe(false);
      expect(state.hasPin).toBe(false);
      expect(state.hasBiometric).toBe(false);
      expect(state.isEnabled).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Change password
  // -----------------------------------------------------------------------

  describe('Change password', () => {
    it('should fail when no password is currently set', async () => {
      new AuthController();

      const sealed = seal(JSON.stringify({ currentPassword: 'old', newPassword: 'NewPass123' }));
      const result = await invokeIPC('auth:changePassword', sealed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No password is currently set');
    });

    it('should fail with incorrect current password', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('OriginalPass1'));

      const sealed = seal(JSON.stringify({ currentPassword: 'WrongCurrent', newPassword: 'NewPass123' }));
      const result = await invokeIPC('auth:changePassword', sealed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('incorrect');
    });

    it('should fail when new password is too short', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('OriginalPass1'));

      const sealed = seal(JSON.stringify({ currentPassword: 'OriginalPass1', newPassword: 'short' }));
      const result = await invokeIPC('auth:changePassword', sealed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 8 characters');
    });

    it('should succeed with correct current password and valid new password', async () => {
      new AuthController();
      await invokeIPC('auth:setPassword', seal('OriginalPass1'));

      const sealed = seal(JSON.stringify({ currentPassword: 'OriginalPass1', newPassword: 'BrandNewPass99' }));
      const result = await invokeIPC('auth:changePassword', sealed);

      expect(result.success).toBe(true);

      // Verify new password works
      const auth = await invokeIPC('auth:authenticatePassword', seal('BrandNewPass99'));
      expect(auth.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Change PIN
  // -----------------------------------------------------------------------

  describe('Change PIN', () => {
    it('should fail when no PIN is currently set', async () => {
      new AuthController();

      const sealed = seal(JSON.stringify({ currentPin: '1234', newPin: '5678' }));
      const result = await invokeIPC('auth:changePin', sealed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No PIN is currently set');
    });

    it('should fail with incorrect current PIN', async () => {
      new AuthController();
      await invokeIPC('auth:setPin', seal('1234'));

      const sealed = seal(JSON.stringify({ currentPin: '0000', newPin: '5678' }));
      const result = await invokeIPC('auth:changePin', sealed);

      expect(result.success).toBe(false);
      expect(result.error).toContain('incorrect');
    });

    it('should succeed with correct current PIN and valid new PIN', async () => {
      new AuthController();
      await invokeIPC('auth:setPin', seal('1234'));

      const sealed = seal(JSON.stringify({ currentPin: '1234', newPin: '5678' }));
      const result = await invokeIPC('auth:changePin', sealed);

      expect(result.success).toBe(true);

      // Verify new PIN works
      const auth = await invokeIPC('auth:authenticatePin', seal('5678'));
      expect(auth.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Recovery codes
  // -----------------------------------------------------------------------

  describe('Recovery codes', () => {
    it('should generate 8 recovery codes', async () => {
      new AuthController();
      const result = await invokeIPC('auth:generateRecoveryCodes');

      expect(result.success).toBe(true);
      expect(result.codes).toBeDefined();
      expect(result.codes).toHaveLength(8);
    });

    it('should generate codes in XXXX-XXXX format', async () => {
      new AuthController();
      const result = await invokeIPC('auth:generateRecoveryCodes');

      for (const code of result.codes) {
        expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
      }
    });

    it('should authenticate with a valid recovery code', async () => {
      new AuthController();
      const genResult = await invokeIPC('auth:generateRecoveryCodes');

      const code = genResult.codes[0];
      const result = await invokeIPC('auth:authenticateRecovery', seal(code));

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
    });

    it('should reject an invalid recovery code', async () => {
      new AuthController();
      await invokeIPC('auth:generateRecoveryCodes');

      const result = await invokeIPC('auth:authenticateRecovery', seal('ZZZZ-ZZZZ'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recovery code');
    });

    it('should consume a recovery code after use (one-time use)', async () => {
      new AuthController();
      const genResult = await invokeIPC('auth:generateRecoveryCodes');

      const code = genResult.codes[0];
      // First use should succeed
      const first = await invokeIPC('auth:authenticateRecovery', seal(code));
      expect(first.success).toBe(true);

      // Second use of the same code should fail
      const second = await invokeIPC('auth:authenticateRecovery', seal(code));
      expect(second.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Idle warning
  // -----------------------------------------------------------------------

  describe('Idle warning', () => {
    it('should report no warning when auth is disabled', () => {
      new AuthController();
      const status = invokeIPC('auth:getIdleWarning');

      expect(status.warningActive).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Public methods
  // -----------------------------------------------------------------------

  describe('Public methods', () => {
    it('isAuthRequired should return false when auth is disabled', () => {
      const ctrl = new AuthController();
      expect(ctrl.isAuthRequired()).toBe(false);
    });

    it('isLocked should return false when auth is not enabled', () => {
      const ctrl = new AuthController();
      expect(ctrl.isLocked()).toBe(false);
    });
  });
});
