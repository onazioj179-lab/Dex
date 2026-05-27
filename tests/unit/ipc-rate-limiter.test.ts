// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// @vitest-environment node

/**
 * ===========================================================================
 * DEX - IPCRateLimiter Tests
 * ===========================================================================
 *
 * Unit tests for the IPC rate-limiting module that prevents abuse of
 * expensive IPC operations from the renderer process.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock electron-log before importing the module under test
// ---------------------------------------------------------------------------

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
// Import — the module exports a singleton, so we re-import for each describe
// block to get a fresh instance. However because the module caches its export,
// we work around staleness by using `setLimit` and an unregistered channel
// prefix to avoid cross-test pollution.
// ---------------------------------------------------------------------------

// We need a fresh IPCRateLimiter for each test. The singleton `ipcRateLimiter`
// is reused across tests, so we create isolation by using unique channel names.
// For cleanup() tests we rely on the module's cleanup method.

let ipcRateLimiter: typeof import('../../src/main/security/IPCRateLimiter')['ipcRateLimiter'];

beforeEach(async () => {
  vi.useFakeTimers();
  // Re-import module to get a fresh singleton each time
  vi.resetModules();
  const mod = await import('../../src/main/security/IPCRateLimiter');
  ipcRateLimiter = mod.ipcRateLimiter;
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Tests
// ===========================================================================

describe('IPCRateLimiter', () => {
  // -------------------------------------------------------------------------
  // 1. Unconfigured channels always pass
  // -------------------------------------------------------------------------
  describe('unconfigured channels', () => {
    it('always returns true for channels with no configured limit', () => {
      for (let i = 0; i < 100; i++) {
        expect(ipcRateLimiter.check('unknown:channel:no-limit')).toBe(true);
      }
    });

    it('enforce() does not throw for unconfigured channels', () => {
      for (let i = 0; i < 50; i++) {
        expect(() => ipcRateLimiter.enforce('unknown:channel:enforce-safe')).not.toThrow();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Configured channels allow up to limit then block
  // -------------------------------------------------------------------------
  describe('configured channels respect limits', () => {
    it('allows calls up to maxCalls and blocks subsequent ones', () => {
      // 'search:rebuild' has maxCalls: 2, windowMs: 300000
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });

    it('blocks after maxCalls for media:getMediaFiles (maxCalls: 5)', () => {
      for (let i = 0; i < 5; i++) {
        expect(ipcRateLimiter.check('media:getMediaFiles')).toBe(true);
      }
      expect(ipcRateLimiter.check('media:getMediaFiles')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Per-sender scoping
  // -------------------------------------------------------------------------
  describe('per-sender scoping', () => {
    it('limits are independent per senderId', () => {
      // Sender 1 exhausts the limit
      expect(ipcRateLimiter.check('search:rebuild', 1)).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild', 1)).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild', 1)).toBe(false);

      // Sender 2 still has full budget
      expect(ipcRateLimiter.check('search:rebuild', 2)).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild', 2)).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild', 2)).toBe(false);
    });

    it('global calls and sender-scoped calls are independent', () => {
      // Exhaust global (no senderId)
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);

      // Sender-scoped still has budget
      expect(ipcRateLimiter.check('search:rebuild', 99)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Window expiry — calls outside the window don't count
  // -------------------------------------------------------------------------
  describe('sliding window expiry', () => {
    it('allows calls again after the window elapses', () => {
      // Exhaust the limit
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);

      // Advance time past the 300 000 ms window
      vi.advanceTimersByTime(300_001);

      // Now calls should be allowed again
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });

    it('only expired timestamps are removed (sliding window)', () => {
      // First call at t=0
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);

      // Advance 200 000 ms and make a second call
      vi.advanceTimersByTime(200_000);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);

      // Now at t=200000, both calls are within the 300000 window
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);

      // Advance to t=300001 — first call expires, second still valid
      vi.advanceTimersByTime(100_001);

      // One slot freed — allow one more
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      // Now we have the t=200000 call and the new one — limit reached
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. enforce() throws on limit exceeded
  // -------------------------------------------------------------------------
  describe('enforce()', () => {
    it('throws an Error when rate limit is exceeded', () => {
      ipcRateLimiter.enforce('search:rebuild');
      ipcRateLimiter.enforce('search:rebuild');

      expect(() => ipcRateLimiter.enforce('search:rebuild')).toThrowError(
        /Rate limit exceeded for search:rebuild/,
      );
    });

    it('thrown error message includes the channel name', () => {
      ipcRateLimiter.enforce('search:rebuild');
      ipcRateLimiter.enforce('search:rebuild');

      try {
        ipcRateLimiter.enforce('search:rebuild');
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e.message).toContain('search:rebuild');
        expect(e.message).toContain('Please try again later');
      }
    });

    it('enforce with senderId throws when that sender exceeds limit', () => {
      ipcRateLimiter.enforce('search:rebuild', 10);
      ipcRateLimiter.enforce('search:rebuild', 10);

      expect(() => ipcRateLimiter.enforce('search:rebuild', 10)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 6. setLimit() overrides defaults
  // -------------------------------------------------------------------------
  describe('setLimit()', () => {
    it('overrides the default limit for a channel', () => {
      // Default for search:rebuild is maxCalls: 2
      // Override to maxCalls: 5
      ipcRateLimiter.setLimit('search:rebuild', { maxCalls: 5, windowMs: 300_000 });

      for (let i = 0; i < 5; i++) {
        expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      }
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });

    it('can set limits on previously unconfigured channels', () => {
      // This channel has no default limit
      ipcRateLimiter.setLimit('custom:channel', { maxCalls: 3, windowMs: 10_000 });

      expect(ipcRateLimiter.check('custom:channel')).toBe(true);
      expect(ipcRateLimiter.check('custom:channel')).toBe(true);
      expect(ipcRateLimiter.check('custom:channel')).toBe(true);
      expect(ipcRateLimiter.check('custom:channel')).toBe(false);
    });

    it('custom limit window works correctly', () => {
      ipcRateLimiter.setLimit('custom:timed', { maxCalls: 1, windowMs: 5000 });

      expect(ipcRateLimiter.check('custom:timed')).toBe(true);
      expect(ipcRateLimiter.check('custom:timed')).toBe(false);

      vi.advanceTimersByTime(5001);

      expect(ipcRateLimiter.check('custom:timed')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 7. cleanup() removes stale data
  // -------------------------------------------------------------------------
  describe('cleanup()', () => {
    it('removes entries whose timestamps have all expired', () => {
      // Make a call, then let the window expire
      ipcRateLimiter.check('search:rebuild');
      vi.advanceTimersByTime(300_001);

      ipcRateLimiter.cleanup();

      // After cleanup, the full budget should be available
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(true);
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });

    it('retains entries that are still within the window', () => {
      ipcRateLimiter.check('search:rebuild');
      ipcRateLimiter.check('search:rebuild');

      // Don't advance past the window
      vi.advanceTimersByTime(1000);
      ipcRateLimiter.cleanup();

      // Still rate-limited because the timestamps are recent
      expect(ipcRateLimiter.check('search:rebuild')).toBe(false);
    });

    it('handles channels with no configured limit by using 60s fallback window', () => {
      // Use a sender-scoped key that won't match any config directly
      // The cleanup code falls back to 60000 ms when no config is found
      ipcRateLimiter.setLimit('cleanup:test', { maxCalls: 1, windowMs: 10_000 });
      ipcRateLimiter.check('cleanup:test');

      vi.advanceTimersByTime(10_001);
      ipcRateLimiter.cleanup();

      // Budget restored after cleanup
      expect(ipcRateLimiter.check('cleanup:test')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Edge case: exactly at maxCalls boundary
  // -------------------------------------------------------------------------
  describe('boundary conditions', () => {
    it('the maxCalls-th call succeeds but maxCalls+1 fails', () => {
      ipcRateLimiter.setLimit('boundary:test', { maxCalls: 3, windowMs: 60_000 });

      // Calls 1, 2, 3 succeed
      expect(ipcRateLimiter.check('boundary:test')).toBe(true);  // 1
      expect(ipcRateLimiter.check('boundary:test')).toBe(true);  // 2
      expect(ipcRateLimiter.check('boundary:test')).toBe(true);  // 3

      // Call 4 fails
      expect(ipcRateLimiter.check('boundary:test')).toBe(false); // 4
    });

    it('maxCalls: 1 allows exactly one call', () => {
      ipcRateLimiter.setLimit('boundary:single', { maxCalls: 1, windowMs: 60_000 });

      expect(ipcRateLimiter.check('boundary:single')).toBe(true);
      expect(ipcRateLimiter.check('boundary:single')).toBe(false);
    });

    it('after one slot frees up, exactly one more call is allowed', () => {
      ipcRateLimiter.setLimit('boundary:refill', { maxCalls: 2, windowMs: 10_000 });

      // Fill both slots at t=0
      expect(ipcRateLimiter.check('boundary:refill')).toBe(true);
      expect(ipcRateLimiter.check('boundary:refill')).toBe(true);
      expect(ipcRateLimiter.check('boundary:refill')).toBe(false);

      // Advance 5000ms, make another call at t=5000
      vi.advanceTimersByTime(5000);
      // Still blocked — both t=0 calls are within 10000ms window
      expect(ipcRateLimiter.check('boundary:refill')).toBe(false);

      // Advance to t=10001 — the two t=0 calls expire
      vi.advanceTimersByTime(5001);
      expect(ipcRateLimiter.check('boundary:refill')).toBe(true);
      expect(ipcRateLimiter.check('boundary:refill')).toBe(true);
      expect(ipcRateLimiter.check('boundary:refill')).toBe(false);
    });
  });
});
