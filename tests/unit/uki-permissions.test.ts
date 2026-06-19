// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX 5.6 — UKI permission transparency + grant/revoke core. This is the model
// the AI Permission Center (Settings -> Permissions -> UKI Assistant Access)
// renders and mutates, so the grant/revoke/describe roundtrip is covered here.
//
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_CAPABILITIES,
  describeCapabilities,
  grant,
  revoke,
  isGranted,
  listGrants,
} from '../../src/renderer/uki/permissions';

beforeEach(() => {
  // Permissions persist through the uki cache (localStorage). A clean slate per
  // test keeps the grant/revoke assertions independent.
  localStorage.clear();
});

describe('UKI permission transparency (describeCapabilities)', () => {
  it('reports every capability in display order, all denied by default', async () => {
    const caps = await describeCapabilities();
    expect(caps.map(c => c.capability)).toEqual([...ALL_CAPABILITIES]);
    expect(caps.every(c => c.status === 'denied')).toBe(true);
    // Each carries a plain label + rationale for the UI.
    expect(caps.every(c => c.label.length > 0 && c.rationale.length > 0)).toBe(true);
  });

  it('shows a persistent grant as granted with no expiry', async () => {
    await grant('file-read', 'persistent');
    expect(await isGranted('file-read')).toBe(true);

    const info = (await describeCapabilities()).find(c => c.capability === 'file-read')!;
    expect(info.status).toBe('granted');
    expect(info.scope).toBe('persistent');
    expect(info.expiresTs).toBeUndefined();
  });

  it('shows a session grant as granted with a future ~4h expiry', async () => {
    const before = Date.now();
    await grant('shell', 'session');

    const info = (await describeCapabilities()).find(c => c.capability === 'shell')!;
    expect(info.status).toBe('granted');
    expect(info.scope).toBe('session');
    expect(info.expiresTs).toBeGreaterThan(before);
    // 4h window, with generous slack for slow CI.
    expect(info.expiresTs! - before).toBeLessThanOrEqual(4 * 60 * 60 * 1000 + 5000);
  });

  it('revoke clears a grant; only the targeted capability is affected', async () => {
    await grant('file-read', 'persistent');
    await grant('network', 'persistent');
    await revoke('file-read');

    expect(await isGranted('file-read')).toBe(false);
    expect(await isGranted('network')).toBe(true);

    const caps = await describeCapabilities();
    expect(caps.find(c => c.capability === 'file-read')!.status).toBe('denied');
    expect(caps.find(c => c.capability === 'network')!.status).toBe('granted');
  });

  it('re-granting a capability replaces the prior record rather than duplicating it', async () => {
    await grant('clipboard', 'session');
    await grant('clipboard', 'persistent');

    const grants = await listGrants();
    expect(grants.filter(g => g.capability === 'clipboard')).toHaveLength(1);
    expect(grants.find(g => g.capability === 'clipboard')!.scope).toBe('persistent');
  });

  it('an expired session grant is pruned and reads back as denied', async () => {
    await grant('camera', 'session');
    // Force the stored grant into the past so the lazy prune on read drops it.
    const grants = await listGrants();
    const stored = grants.map(g =>
      g.capability === 'camera' ? { ...g, expiresTs: Date.now() - 1000 } : g,
    );
    const cache = await import('../../src/renderer/uki/cache');
    await cache.setAsync('uki:permissions', stored);

    expect(await isGranted('camera')).toBe(false);
    expect((await describeCapabilities()).find(c => c.capability === 'camera')!.status).toBe('denied');
  });
});
