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
// Mocks
// ---------------------------------------------------------------------------

const ipcHandlers: Record<string, Function> = {};

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandlers[channel] = handler;
    }),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
  },
}));

vi.mock('electron-log', () => {
  const logFns = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return {
    default: logFns,
    ...logFns,
  };
});

vi.mock('electron-store', () => ({
  default: vi.fn(function() {
    return {
      get: vi.fn((_key: string, def?: unknown) => def),
      set: vi.fn(),
      delete: vi.fn(),
    };
  }),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  realpathSync: vi.fn((p: string) => p),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(() => Promise.reject(new Error('not found'))),
    writeFile: vi.fn(() => Promise.resolve()),
    stat: vi.fn(() => Promise.resolve({ size: 0 })),
    mkdir: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(new Error('not found'))),
  writeFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(senderId = 1) {
  return {
    sender: { id: senderId },
    senderFrame: { routingId: senderId },
  };
}

/** Invoke the handler that was registered on ipcMain.handle for the given channel. */
async function invokeChannel(channel: string, input: unknown, senderId = 1) {
  const handler = ipcHandlers[channel];
  if (!handler) throw new Error(`No handler registered for "${channel}"`);
  return handler(makeEvent(senderId), input);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SecureIpcRouter', () => {
  let SecureIpcRouter: any;

  beforeEach(async () => {
    vi.resetModules();
    // Clear tracked handlers
    for (const key of Object.keys(ipcHandlers)) delete ipcHandlers[key];

    const mod = await import('../../src/main/security/SecureIpcRouter');
    SecureIpcRouter = mod.SecureIpcRouter;
  });

  // =========================================================================
  // CHANNEL REGISTRATION
  // =========================================================================

  describe('register()', () => {
    it('registers a channel and exposes it via channels()', () => {
      const router = new SecureIpcRouter();
      router.register('test:channel', async () => 'ok');
      expect(router.channels()).toContain('test:channel');
      expect(router.size).toBe(1);
    });

    it('returns the router for chaining', () => {
      const router = new SecureIpcRouter();
      const result = router.register('ch1', async () => 1);
      expect(result).toBe(router);
    });

    it('ignores duplicate registrations for the same channel', () => {
      const router = new SecureIpcRouter();
      router.register('dup:ch', async () => 1);
      router.register('dup:ch', async () => 2);
      expect(router.size).toBe(1);
    });

    it('sorts channel names in channels()', () => {
      const router = new SecureIpcRouter();
      router.register('z:channel', async () => {});
      router.register('a:channel', async () => {});
      router.register('m:channel', async () => {});
      expect(router.channels()).toEqual(['a:channel', 'm:channel', 'z:channel']);
    });

    it('registers and mounts immediately if mount() was already called', () => {
      const router = new SecureIpcRouter();
      router.mount();
      router.register('late:channel', async () => 'late');
      // Should have been mounted -> handler exists in ipcMain
      expect(ipcHandlers['late:channel']).toBeDefined();
    });
  });

  // =========================================================================
  // MOUNT / UNMOUNT LIFECYCLE
  // =========================================================================

  describe('mount()', () => {
    it('registers all channels on ipcMain.handle', () => {
      const router = new SecureIpcRouter();
      router.register('ch1', async () => 'a');
      router.register('ch2', async () => 'b');
      router.mount();
      expect(ipcHandlers['ch1']).toBeDefined();
      expect(ipcHandlers['ch2']).toBeDefined();
    });

    it('is idempotent -- second mount() is a no-op', () => {
      const router = new SecureIpcRouter();
      router.register('ch1', async () => 'a');
      router.mount();
      const keysBefore = Object.keys(ipcHandlers).length;
      router.mount();
      expect(Object.keys(ipcHandlers).length).toBe(keysBefore);
    });

    it('returns the router for chaining', () => {
      const router = new SecureIpcRouter();
      expect(router.mount()).toBe(router);
    });
  });

  // =========================================================================
  // HANDLER INVOCATION -- SUCCESS PATH
  // =========================================================================

  describe('handler invocation', () => {
    it('wraps successful handler return in an ok envelope', async () => {
      const router = new SecureIpcRouter();
      router.register('test:ok', async () => ({ data: 42 }));
      router.mount();

      const result = await invokeChannel('test:ok', {});
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ data: 42 });
    });

    it('wraps handler errors in an error envelope (never throws)', async () => {
      const router = new SecureIpcRouter();
      router.register('test:fail', async () => { throw new Error('boom'); });
      router.mount();

      const result = await invokeChannel('test:fail', {});
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('boom');
    });

    it('passes input to the handler', async () => {
      const handler = vi.fn(async (input: any) => input.x + 1);
      const router = new SecureIpcRouter();
      router.register('test:input', handler);
      router.mount();

      const result = await invokeChannel('test:input', { x: 10 });
      expect(result.ok).toBe(true);
      expect(result.value).toBe(11);
    });
  });

  // =========================================================================
  // RATE LIMITING
  // =========================================================================

  describe('rate limiting', () => {
    it('blocks calls exceeding the rate limit', async () => {
      const router = new SecureIpcRouter();
      router.register('test:rl', async () => 'ok', {
        rateLimit: { maxCalls: 3, windowMs: 60000 },
      });
      router.mount();

      // First 3 should succeed
      for (let i = 0; i < 3; i++) {
        const r = await invokeChannel('test:rl', {});
        expect(r.ok).toBe(true);
      }

      // 4th should be rate limited
      const limited = await invokeChannel('test:rl', {});
      expect(limited.ok).toBe(false);
      expect(limited.error.code).toBe('E_RATE_LIMITED');
    });

    it('rate limits per sender independently', async () => {
      const router = new SecureIpcRouter();
      router.register('test:rl2', async () => 'ok', {
        rateLimit: { maxCalls: 2, windowMs: 60000 },
      });
      router.mount();

      // Sender 1: 2 calls
      await invokeChannel('test:rl2', {}, 1);
      await invokeChannel('test:rl2', {}, 1);
      // Sender 1 is now limited
      const s1limited = await invokeChannel('test:rl2', {}, 1);
      expect(s1limited.ok).toBe(false);

      // Sender 2 still has quota
      const s2ok = await invokeChannel('test:rl2', {}, 2);
      expect(s2ok.ok).toBe(true);
    });

    it('uses default rate limit (120/60s) when none specified', async () => {
      const router = new SecureIpcRouter();
      router.register('test:rl-default', async () => 'ok');
      router.mount();

      // Should be able to make many calls with default limit
      for (let i = 0; i < 50; i++) {
        const r = await invokeChannel('test:rl-default', {});
        expect(r.ok).toBe(true);
      }
    });
  });

  // =========================================================================
  // PATH VALIDATION (requiresPath)
  // =========================================================================

  describe('requiresPath validation', () => {
    it('validates path fields in the payload when requiresPath is true', async () => {
      const router = new SecureIpcRouter();
      router.register(
        'test:path',
        async (input: any) => `processed: ${input.filePath}`,
        { requiresPath: true }
      );
      router.mount();

      // Null byte injection should be rejected by PathValidator
      const result = await invokeChannel('test:path', { filePath: '/home/user/file\0.txt' });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_PATH_DENIED');
    });

    it('does not validate paths when requiresPath is false or absent', async () => {
      const router = new SecureIpcRouter();
      router.register('test:nopath', async (input: any) => input.filePath);
      router.mount();

      // Even a weird path should pass through since there's no path validation
      const result = await invokeChannel('test:nopath', { filePath: 'anything' });
      expect(result.ok).toBe(true);
    });

    it('validates multiple path keys (path, filePath, src, dest, etc.)', async () => {
      const router = new SecureIpcRouter();
      router.register(
        'test:multipath',
        async (input: any) => 'ok',
        { requiresPath: true }
      );
      router.mount();

      // null bytes in src field
      const result = await invokeChannel('test:multipath', { src: '/home/user/a\0b' });
      expect(result.ok).toBe(false);
    });

    it('passes through non-string values in path keys without error', async () => {
      const router = new SecureIpcRouter();
      router.register(
        'test:pathnum',
        async (input: any) => 'ok',
        { requiresPath: true }
      );
      router.mount();

      // Number value for 'path' -- sanitizePaths checks typeof === 'string'
      const result = await invokeChannel('test:pathnum', { path: 42 });
      expect(result.ok).toBe(true);
    });

    it('ignores non-object payloads for path sanitization', async () => {
      const router = new SecureIpcRouter();
      router.register(
        'test:pathnil',
        async () => 'ok',
        { requiresPath: true }
      );
      router.mount();

      const result = await invokeChannel('test:pathnil', null);
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // GUARD VALIDATION
  // =========================================================================

  describe('guard validation', () => {
    it('rejects payloads that fail the guard', async () => {
      const isNumber = (v: unknown): v is number => typeof v === 'number';
      const router = new SecureIpcRouter();
      router.register('test:guard', async (n: number) => n * 2, {
        guard: isNumber,
      });
      router.mount();

      // String fails number guard
      const result = await invokeChannel('test:guard', 'not-a-number');
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_IPC_GUARD');
    });

    it('passes payloads that satisfy the guard', async () => {
      const isNumber = (v: unknown): v is number => typeof v === 'number';
      const router = new SecureIpcRouter();
      router.register('test:guard-ok', async (n: number) => n * 2, {
        guard: isNumber,
      });
      router.mount();

      const result = await invokeChannel('test:guard-ok', 5);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(10);
    });

    it('skips guard validation when no guard is specified', async () => {
      const router = new SecureIpcRouter();
      router.register('test:no-guard', async (x: any) => x);
      router.mount();

      const result = await invokeChannel('test:no-guard', { anything: true });
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // ERROR ENVELOPE WRAPPING
  // =========================================================================

  describe('error envelope wrapping', () => {
    it('wraps sync handler throws into error envelopes', async () => {
      const router = new SecureIpcRouter();
      router.register('test:sync-throw', () => { throw new TypeError('bad type'); });
      router.mount();

      const result = await invokeChannel('test:sync-throw', {});
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('bad type');
    });

    it('wraps async rejection into error envelopes', async () => {
      const router = new SecureIpcRouter();
      router.register('test:async-reject', async () => {
        throw new RangeError('out of range');
      });
      router.mount();

      const result = await invokeChannel('test:async-reject', {});
      expect(result.ok).toBe(false);
      expect(result.error.message).toContain('out of range');
    });

    it('envelope has op field matching the channel', async () => {
      const router = new SecureIpcRouter();
      router.register('my:channel', async () => 42);
      router.mount();

      const result = await invokeChannel('my:channel', {});
      expect(result.op).toBe('my:channel');
    });

    it('envelope has timestamp field', async () => {
      const router = new SecureIpcRouter();
      router.register('ts:channel', async () => 'ok');
      router.mount();

      const before = Date.now();
      const result = await invokeChannel('ts:channel', {});
      expect(result.t).toBeGreaterThanOrEqual(before);
    });

    it('rate limited response has E_RATE_LIMITED code in envelope', async () => {
      const router = new SecureIpcRouter();
      router.register('test:rl-env', async () => 'ok', {
        rateLimit: { maxCalls: 1, windowMs: 60000 },
      });
      router.mount();

      await invokeChannel('test:rl-env', {});
      const limited = await invokeChannel('test:rl-env', {});
      expect(limited.ok).toBe(false);
      expect(limited.error.code).toBe('E_RATE_LIMITED');
      expect(limited.error.message).toContain('Rate limit');
    });
  });

  // =========================================================================
  // SHARED SINGLETON INSTANCE
  // =========================================================================

  describe('secureIpcRouter singleton', () => {
    it('exports a shared router instance', async () => {
      const mod = await import('../../src/main/security/SecureIpcRouter');
      expect(mod.secureIpcRouter).toBeDefined();
      expect(mod.secureIpcRouter).toBeInstanceOf(mod.SecureIpcRouter);
    });
  });

  // =========================================================================
  // COMBINED SCENARIOS
  // =========================================================================

  describe('combined scenarios', () => {
    it('guard runs before handler (handler not called on guard failure)', async () => {
      const handler = vi.fn(async () => 'should not run');
      const router = new SecureIpcRouter();
      router.register('test:guard-order', handler, {
        guard: (v: unknown): v is string => typeof v === 'string',
      });
      router.mount();

      await invokeChannel('test:guard-order', 123);
      expect(handler).not.toHaveBeenCalled();
    });

    it('rate limit runs before guard and handler', async () => {
      const handler = vi.fn(async () => 'ok');
      const guard = vi.fn((v: unknown): v is unknown => true);
      const router = new SecureIpcRouter();
      router.register('test:rl-before', handler, {
        rateLimit: { maxCalls: 1, windowMs: 60000 },
        guard,
      });
      router.mount();

      await invokeChannel('test:rl-before', {});
      handler.mockClear();
      guard.mockClear();

      // Second call should be rate limited before guard or handler run
      const result = await invokeChannel('test:rl-before', {});
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('E_RATE_LIMITED');
      // Guard and handler should NOT have been called for the rate-limited request
      // (Note: guard is passed to safeHandler, which runs after rate limit check,
      //  so it won't be called for rate-limited requests)
      expect(handler).not.toHaveBeenCalled();
    });

    it('path validation runs before handler on requiresPath channels', async () => {
      const handler = vi.fn(async () => 'ok');
      const router = new SecureIpcRouter();
      router.register('test:path-order', handler, { requiresPath: true });
      router.mount();

      // Null byte should be rejected before handler runs
      await invokeChannel('test:path-order', { path: '/a\0b' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('multiple channels share the same router without interference', async () => {
      const router = new SecureIpcRouter();
      router.register('ch:a', async () => 'alpha');
      router.register('ch:b', async () => 'beta');
      router.mount();

      const a = await invokeChannel('ch:a', {});
      const b = await invokeChannel('ch:b', {});
      expect(a.value).toBe('alpha');
      expect(b.value).toBe('beta');
    });
  });
});
