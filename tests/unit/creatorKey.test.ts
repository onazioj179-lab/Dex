// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Native creator-key smoke tests. Verifies challenge issuance, replay
// rejection, and token tamper rejection. The placeholder build embeds a
// zeroed pubkey, so all signature verifications must fail closed.
//
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import * as path from 'path';

const requireFromHere = createRequire(import.meta.url);
let nativeMod: any = null;
try {
  // Loaded at runtime so the test file can be discovered even if the
  // native binary is missing on this platform. Tests then no-op.
  // Bypass the index.js platform dispatcher and load the .node binary
  // directly -- the dispatcher prefers msvc on win32 but our build
  // produces the gnu artifact.
  const candidates = [
    path.resolve(__dirname, '../../native/dex-native.win32-x64-gnu.node'),
    path.resolve(__dirname, '../../native/dex-native.win32-x64-msvc.node'),
    path.resolve(__dirname, '../../native/index.js'),
  ];
  for (const p of candidates) {
    try {
      nativeMod = requireFromHere(p);
      if (nativeMod && typeof nativeMod.creatorKeyStatus === 'function') break;
    } catch { /* try next */ }
  }
} catch (err) {
  console.warn('[creator-key.test] native unavailable:', err);
  nativeMod = null;
}

const skipIfNoNative = nativeMod && typeof nativeMod.creatorKeyStatus === 'function'
  ? describe
  : describe.skip;

skipIfNoNative('native creator key', () => {
  it('reports an embedded-key status', () => {
    const s = nativeMod.creatorKeyStatus();
    expect(typeof s.configured).toBe('boolean');
    if (s.configured) {
      expect(typeof s.fingerprint).toBe('string');
      expect(s.fingerprint.length).toBe(16);
    }
  });

  it('issues a fresh challenge with the v1 prefix and a future expiry', () => {
    const c = nativeMod.creatorMakeChallenge();
    expect(c.challenge.startsWith('DEX-CREATOR-v1\n')).toBe(true);
    expect(c.expiresAt).toBeGreaterThan(c.issuedAt);
  });

  it('rejects an unknown challenge (replay protection)', () => {
    const r = nativeMod.creatorVerifySignature('not-a-real-challenge', '00'.repeat(64));
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed signature', () => {
    const c = nativeMod.creatorMakeChallenge();
    const r = nativeMod.creatorVerifySignature(c.challenge, 'not-hex');
    expect(r.ok).toBe(false);
    // With a placeholder pubkey, the no-key check fires first; with a real
    // key embedded, the malformed-signature check fires. Both are valid
    // failure modes.
    expect(['malformed-signature', 'no-creator-key-embedded']).toContain(r.reason);
  });

  it('rejects a malformed token', () => {
    const r = nativeMod.creatorCheckToken('garbage');
    expect(r.valid).toBe(false);
  });

  it('rejects a syntactically valid but unsigned token', () => {
    // Properly formatted but with a fake MAC -- must be rejected.
    const fake = `v1|${Math.floor(Date.now() / 1000) + 600}|${'ab'.repeat(16)}|${'cd'.repeat(32)}`;
    const r = nativeMod.creatorCheckToken(fake);
    expect(r.valid).toBe(false);
  });

  it('refuses verification when the placeholder pubkey is in place', () => {
    const status = nativeMod.creatorKeyStatus();
    if (status.configured) return; // skip when a real key is embedded
    const c = nativeMod.creatorMakeChallenge();
    const r = nativeMod.creatorVerifySignature(c.challenge, 'aa'.repeat(64));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-creator-key-embedded');
  });
});
