// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  mintToken, verifyToken, MemoryReplayCache, type TokenVerifier,
} from '../../src/shared/runtime/capabilityToken';

const fakeVerifier: TokenVerifier = {
  computeHmac: (p: string) => 'h:' + p,
};

describe('capability tokens', () => {
  it('mints and verifies', () => {
    const t = mintToken({ appId: 'a', capability: 'files.read', ttlMs: 1000, nonce: 1 }, 0, fakeVerifier);
    const cache = new MemoryReplayCache();
    expect(verifyToken(t, { appId: 'a', capability: 'files.read' }, 100, fakeVerifier, cache)).toEqual({ ok: true });
  });
  it('rejects expired, wrong app, wrong cap, replay, bad hmac', () => {
    const cache = new MemoryReplayCache();
    const t = mintToken({ appId: 'a', capability: 'files.read', ttlMs: 1000, nonce: 1 }, 0, fakeVerifier);
    expect(verifyToken(t, { appId: 'a', capability: 'files.read' }, 5000, fakeVerifier, cache)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyToken(t, { appId: 'b', capability: 'files.read' }, 100, fakeVerifier, cache)).toEqual({ ok: false, reason: 'wrong-app' });
    expect(verifyToken(t, { appId: 'a', capability: 'network' }, 100, fakeVerifier, cache)).toEqual({ ok: false, reason: 'wrong-cap' });
    expect(verifyToken(t, { appId: 'a', capability: 'files.read' }, 100, fakeVerifier, cache)).toEqual({ ok: true });
    expect(verifyToken(t, { appId: 'a', capability: 'files.read' }, 100, fakeVerifier, cache)).toEqual({ ok: false, reason: 'replay' });
    const tampered = { ...t, hmac: 'wrong' };
    expect(verifyToken(tampered, { appId: 'a', capability: 'files.read' }, 100, fakeVerifier, new MemoryReplayCache())).toEqual({ ok: false, reason: 'bad-hmac' });
  });
});
