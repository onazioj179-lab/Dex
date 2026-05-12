// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave shared infrastructure tests.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  ariaButton,
  ariaToggle,
  ariaTrigger,
  ariaCurrent,
  ariaLive,
  ariaInput,
  withPermission,
  _resetRateBuckets,
  rafThrottle,
  presence,
} from '../../src/renderer/improvements500';

describe('improvements500 / aria helpers', () => {
  it('ariaButton produces label + type=button by default', () => {
    expect(ariaButton('Mute')).toEqual({ 'aria-label': 'Mute', type: 'button' });
  });

  it('ariaButton supports pressed + disabled flags', () => {
    expect(ariaButton('Solo', { pressed: true, disabled: true })).toMatchObject({
      'aria-label': 'Solo', 'aria-pressed': true, 'aria-disabled': true,
    });
  });

  it('ariaToggle exposes pressed state', () => {
    expect(ariaToggle('Loop', false)['aria-pressed']).toBe(false);
    expect(ariaToggle('Loop', true)['aria-pressed']).toBe(true);
  });

  it('ariaTrigger marks expanded popup state', () => {
    const t = ariaTrigger('Open menu', true, 'menu-1');
    expect(t['aria-haspopup']).toBe('menu');
    expect(t['aria-expanded']).toBe(true);
    expect(t['aria-controls']).toBe('menu-1');
  });

  it('ariaCurrent only emits aria-current when truthy', () => {
    expect(ariaCurrent('Home', false)['aria-current']).toBeUndefined();
    expect(ariaCurrent('Home', true)['aria-current']).toBe('true');
  });

  it('ariaLive returns role=status with politeness', () => {
    expect(ariaLive('assertive')).toMatchObject({ role: 'status', 'aria-live': 'assertive', 'aria-atomic': true });
  });

  it('ariaInput wires id + label + describedby', () => {
    expect(ariaInput('email', 'Email', { describedBy: 'hint', invalid: true })).toEqual({
      id: 'email', 'aria-label': 'Email', 'aria-describedby': 'hint', 'aria-invalid': true,
    });
  });
});

describe('improvements500 / withPermission', () => {
  beforeEach(() => { _resetRateBuckets(); });

  it('passes through when permission granted and args valid', async () => {
    const fn = withPermission({
      channel: 'test.echo',
      permission: 'test.echo',
      handler: async (n: number) => n * 2,
      hasPermission: () => true,
    });
    expect(await fn(21)).toBe(42);
  });

  it('throws when permission missing', async () => {
    const fn = withPermission({
      channel: 'test.deny', permission: 'test.deny',
      handler: async () => 'ok', hasPermission: () => false,
    });
    await expect(fn(undefined)).rejects.toThrow(/denied/);
  });

  it('runs validator and surfaces error', async () => {
    const fn = withPermission({
      channel: 'test.val', permission: 'test.val', hasPermission: () => true,
      validate: (n: number) => (n < 0 ? 'must be >= 0' : null),
      handler: async (n: number) => n,
    });
    await expect(fn(-1)).rejects.toThrow(/invalid args.*>= 0/);
    expect(await fn(3)).toBe(3);
  });

  it('rate-limits per channel', async () => {
    const fn = withPermission({
      channel: 'test.rate', permission: 'test.rate', hasPermission: () => true,
      rateLimit: 3, windowMs: 60_000,
      handler: async () => 'ok',
    });
    await fn(undefined); await fn(undefined); await fn(undefined);
    await expect(fn(undefined)).rejects.toThrow(/rate limit/);
  });

  it('redacts sensitive keys from error logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fn = withPermission({
      channel: 'test.redact', permission: 'test.redact', hasPermission: () => true,
      sensitiveKeys: ['password'],
      handler: async () => { throw new Error('boom'); },
    });
    await expect(fn({ user: 'alice', password: 'secret' })).rejects.toThrow('boom');
    const logged = warn.mock.calls[0]?.[1] as { password?: string };
    expect(logged?.password).toBe('<redacted>');
    warn.mockRestore();
  });
});

describe('improvements500 / rafThrottle', () => {
  it('coalesces rapid calls to one rAF tick', async () => {
    const calls: number[] = [];
    const fn = rafThrottle((n: number) => { calls.push(n); });
    fn(1); fn(2); fn(3);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(calls).toEqual([3]);
  });
});

describe('improvements500 / presence', () => {
  beforeEach(() => { presence._reset(); });
  afterEach(() => { presence._reset(); });

  it('tracks self status updates', () => {
    presence.setSelf({ userId: 'u1', displayName: 'Alice', status: 'online' });
    expect(presence.getSelf()?.status).toBe('online');
    presence.setStatus('busy');
    expect(presence.getSelf()?.status).toBe('busy');
  });

  it('clips custom status text to 80 chars', () => {
    presence.setSelf({ userId: 'u1', displayName: 'Alice', status: 'online' });
    presence.setCustomText('x'.repeat(200));
    expect(presence.getSelf()?.customText?.length).toBe(80);
  });

  it('lists peers alphabetically and removes them', () => {
    presence.upsertPeer({ userId: 'b', displayName: 'Bob', status: 'online', lastSeen: 0 });
    presence.upsertPeer({ userId: 'a', displayName: 'Ada', status: 'online', lastSeen: 0 });
    expect(presence.listPeers().map((p) => p.displayName)).toEqual(['Ada', 'Bob']);
    presence.removePeer('a');
    expect(presence.listPeers().map((p) => p.displayName)).toEqual(['Bob']);
  });

  it('pruneIdle marks long-quiet peers as idle', () => {
    presence.upsertPeer({ userId: 'a', displayName: 'Ada', status: 'online', lastSeen: 0 });
    presence.pruneIdle(10 * 60_000);
    expect(presence.listPeers()[0]?.status).toBe('idle');
  });

  it('subscribe + unsubscribe invokes listener on changes', () => {
    const fn = vi.fn();
    const off = presence.subscribe(fn);
    presence.upsertPeer({ userId: 'a', displayName: 'A', status: 'online', lastSeen: 0 });
    expect(fn).toHaveBeenCalled();
    off();
    fn.mockClear();
    presence.upsertPeer({ userId: 'b', displayName: 'B', status: 'online', lastSeen: 0 });
    expect(fn).not.toHaveBeenCalled();
  });
});
