// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

/**
 * IPCInterceptor tests
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the import of the module under test
// ---------------------------------------------------------------------------

const handleFns = new Map<string, (...args: unknown[]) => unknown>();
const onFns = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...a: unknown[]) => unknown) => {
      handleFns.set(channel, fn);
    }),
    on: vi.fn((channel: string, fn: (...a: unknown[]) => unknown) => {
      onFns.set(channel, fn);
    }),
  },
  webContents: {},
}));

vi.mock('electron-log', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./IPCValidator', () => ({
  InputSanitizer: {
    sanitizeString: vi.fn((s: string) => s),
    sanitizeObject: vi.fn((o: unknown) => o),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test — AFTER mocks
// ---------------------------------------------------------------------------

import {
  secureHandle,
  secureOn,
  configureInterceptor,
  getInterceptorConfig,
  getSecurityEvents,
  getSenderSecurityStats,
  clearSecurityStats,
  addBypassChannel,
  removeBypassChannel,
} from '../../src/main/security/IPCInterceptor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal IpcMainInvokeEvent stub */
function invokeEvent(senderId: number) {
  return { sender: { id: senderId } } as unknown;
}

/** Build a minimal IpcMainEvent stub */
function mainEvent(senderId: number) {
  return { sender: { id: senderId } } as unknown;
}

const DEFAULT_CONFIG = {
  enabled: true,
  globalRateLimit: 500,
  perChannelRateLimit: 100,
  maxPayloadBytes: 1_048_576,
  logViolations: true,
  blockMalicious: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IPCInterceptor', () => {
  beforeEach(() => {
    // Reset ALL module-level state between tests
    clearSecurityStats();
    configureInterceptor({ ...DEFAULT_CONFIG });
    handleFns.clear();
    onFns.clear();
    vi.clearAllMocks();
  });

  // ── 1. Bypass channels always pass ──────────────────────────────────────
  describe('bypass channels', () => {
    it.each(['get-app-path', 'get-version', 'get-platform'])(
      '%s channel bypasses all validation',
      async (channel) => {
        const handler = vi.fn().mockResolvedValue('ok');
        secureHandle(channel, handler);

        const wrappedFn = handleFns.get(channel)!;
        const result = await wrappedFn(invokeEvent(1));
        expect(result).toBe('ok');
        expect(handler).toHaveBeenCalledTimes(1);
      },
    );
  });

  // ── 2. Global rate limit (500/sec) ──────────────────────────────────────
  describe('global rate limit', () => {
    it('blocks a sender exceeding 500 calls per second', async () => {
      const handler = vi.fn().mockResolvedValue('ok');

      // Register many channels so per-channel limit (100) is not hit first.
      // We spread 500 calls across 6 channels (< 100 per channel).
      const channels: string[] = [];
      for (let c = 0; c < 6; c++) {
        const ch = `global-limit-ch-${c}`;
        channels.push(ch);
        secureHandle(ch, handler);
      }

      const senderId = 10;
      for (let i = 0; i < 500; i++) {
        const fn = handleFns.get(channels[i % channels.length])!;
        await fn(invokeEvent(senderId));
      }
      expect(handler).toHaveBeenCalledTimes(500);

      // 501st call should be rejected (global rate limit)
      const fn = handleFns.get(channels[0])!;
      await expect(fn(invokeEvent(senderId))).rejects.toThrow('Rate limit exceeded');
    });
  });

  // ── 3. Sender blocking: 5 violations -> blocked for 60s ────────────────
  describe('sender blocking', () => {
    it('blocks sender after 5 rate-limit violations', async () => {
      const handler = vi.fn().mockResolvedValue('ok');

      // Use multiple channels to avoid per-channel limit (100) before
      // hitting the global limit (500).
      const channels: string[] = [];
      for (let c = 0; c < 6; c++) {
        const ch = `block-ch-${c}`;
        channels.push(ch);
        secureHandle(ch, handler);
      }

      const senderId = 20;

      // Exhaust the global window: 500 valid calls spread across channels
      for (let i = 0; i < 500; i++) {
        const fn = handleFns.get(channels[i % channels.length])!;
        await fn(invokeEvent(senderId));
      }

      // Next 5 calls each produce a global-rate-limit violation
      for (let i = 0; i < 5; i++) {
        const fn = handleFns.get(channels[i % channels.length])!;
        await expect(fn(invokeEvent(senderId))).rejects.toThrow();
      }

      const stats = getSenderSecurityStats(senderId);
      expect(stats).toBeDefined();
      expect(stats!.blocked).toBe(true);
      expect(stats!.blockedUntil).toBeGreaterThan(Date.now() - 1000);

      // Even a fresh channel is blocked for this sender
      secureHandle('other-channel', handler);
      const otherFn = handleFns.get('other-channel')!;
      await expect(otherFn(invokeEvent(senderId))).rejects.toThrow(
        'Temporarily blocked due to excessive violations',
      );
    });
  });

  // ── 4. Malicious pattern detection ─────────────────────────────────────
  describe('malicious pattern detection', () => {
    it.each([
      ['path traversal', '../../../etc/passwd'],
      ['path traversal (backslash)', '..\\..\\windows\\system32'],
      ['script tag', '<script>alert(1)</script>'],
      ['eval()', 'eval("code")'],
      ['javascript: protocol', 'javascript:alert(1)'],
      ['Function constructor', 'new Function("return 1")'],
    ])('blocks %s', async (_label, maliciousPayload) => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('secure-channel', handler);
      const wrappedFn = handleFns.get('secure-channel')!;

      await expect(
        wrappedFn(invokeEvent(30), maliciousPayload),
      ).rejects.toThrow('Request blocked for security reasons');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── 5. Payload size > 1MB rejected ─────────────────────────────────────
  describe('payload size limit', () => {
    it('rejects payloads larger than maxPayloadBytes', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('big-payload', handler);
      const wrappedFn = handleFns.get('big-payload')!;

      const large = 'x'.repeat(1_100_000); // > 1MB
      await expect(wrappedFn(invokeEvent(40), large)).rejects.toThrow('Payload too large');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── 6. clearSecurityStats resets all state ─────────────────────────────
  describe('clearSecurityStats', () => {
    it('resets sender stats and events', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('stats-channel', handler);
      const wrappedFn = handleFns.get('stats-channel')!;

      // Generate some traffic
      for (let i = 0; i < 10; i++) {
        await wrappedFn(invokeEvent(50));
      }
      expect(getSenderSecurityStats(50)).toBeDefined();

      clearSecurityStats();
      expect(getSenderSecurityStats(50)).toBeUndefined();
      expect(getSecurityEvents()).toHaveLength(0);
    });
  });

  // ── 7. configureInterceptor changes config ─────────────────────────────
  describe('configureInterceptor', () => {
    it('updates config values', () => {
      configureInterceptor({ globalRateLimit: 1000, logViolations: false });
      const cfg = getInterceptorConfig();
      expect(cfg.globalRateLimit).toBe(1000);
      expect(cfg.logViolations).toBe(false);
      // Untouched fields remain
      expect(cfg.enabled).toBe(true);
    });

    it('disabling the interceptor allows everything through', async () => {
      configureInterceptor({ enabled: false });

      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('disabled-channel', handler);
      const wrappedFn = handleFns.get('disabled-channel')!;

      // Malicious payload should pass when disabled
      const result = await wrappedFn(invokeEvent(60), '../../../etc/passwd');
      expect(result).toBe('ok');
    });
  });

  // ── 8. addBypassChannel / removeBypassChannel ─────────────────────────
  describe('addBypassChannel / removeBypassChannel', () => {
    it('adds a channel to the bypass list', async () => {
      addBypassChannel('custom-bypass');

      const handler = vi.fn().mockResolvedValue('bypassed');
      secureHandle('custom-bypass', handler);
      const wrappedFn = handleFns.get('custom-bypass')!;

      // Even a huge payload passes on a bypass channel
      const large = 'x'.repeat(2_000_000);
      const result = await wrappedFn(invokeEvent(70), large);
      expect(result).toBe('bypassed');

      // Clean up
      removeBypassChannel('custom-bypass');
    });

    it('removes a channel from the bypass list', async () => {
      addBypassChannel('temp-bypass');
      removeBypassChannel('temp-bypass');

      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('temp-bypass', handler);
      const wrappedFn = handleFns.get('temp-bypass')!;

      // Large payload should now be rejected
      const large = 'x'.repeat(2_000_000);
      await expect(wrappedFn(invokeEvent(80), large)).rejects.toThrow('Payload too large');
    });
  });

  // ── 9. getSecurityEvents returns event log ─────────────────────────────
  describe('getSecurityEvents', () => {
    it('records and returns security events', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('event-channel', handler);
      const wrappedFn = handleFns.get('event-channel')!;

      // Trigger a malicious pattern event
      await expect(
        wrappedFn(invokeEvent(90), '<script>xss</script>'),
      ).rejects.toThrow();

      const events = getSecurityEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const last = events[events.length - 1];
      expect(last.type).toBe('malicious_pattern');
      expect(last.senderId).toBe(90);
      expect(last.channel).toBe('event-channel');
    });

    it('respects the limit parameter', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('limit-channel', handler);
      const wrappedFn = handleFns.get('limit-channel')!;

      // Generate multiple events via malicious payloads from different senders
      for (let i = 0; i < 5; i++) {
        try {
          await wrappedFn(invokeEvent(100 + i), 'eval("bad")');
        } catch { /* expected */ }
      }

      const limited = getSecurityEvents(2);
      expect(limited).toHaveLength(2);
    });
  });

  // ── 10. secureHandle wraps handler with validation ─────────────────────
  describe('secureHandle', () => {
    it('passes sanitized args to the handler on valid requests', async () => {
      const handler = vi.fn().mockResolvedValue('result');
      secureHandle('wrapped-channel', handler);
      const wrappedFn = handleFns.get('wrapped-channel')!;

      const evt = invokeEvent(110);
      const result = await wrappedFn(evt, 'arg1', 42);
      expect(result).toBe('result');
      expect(handler).toHaveBeenCalledTimes(1);
      // First argument should be the event
      expect(handler.mock.calls[0][0]).toBe(evt);
    });
  });

  // ── 11. Per-channel rate limit (100/sec) ───────────────────────────────
  describe('per-channel rate limit', () => {
    it('blocks after 100 calls per second on a single channel', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      secureHandle('per-ch-limit', handler);
      const wrappedFn = handleFns.get('per-ch-limit')!;

      const senderId = 120;
      // Fire 100 allowed calls
      for (let i = 0; i < 100; i++) {
        await wrappedFn(invokeEvent(senderId));
      }
      expect(handler).toHaveBeenCalledTimes(100);

      // 101st call should be rejected with channel rate limit
      await expect(wrappedFn(invokeEvent(senderId))).rejects.toThrow(
        'Channel rate limit exceeded',
      );
    });
  });

  // ── secureOn ───────────────────────────────────────────────────────────
  describe('secureOn', () => {
    it('calls handler when request is valid', () => {
      const handler = vi.fn();
      secureOn('on-channel', handler);
      const wrappedFn = onFns.get('on-channel')!;

      wrappedFn(mainEvent(130), 'safe-arg');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('silently drops messages that fail validation', () => {
      const handler = vi.fn();
      secureOn('on-channel-malicious', handler);
      const wrappedFn = onFns.get('on-channel-malicious')!;

      wrappedFn(mainEvent(140), '<script>alert(1)</script>');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
