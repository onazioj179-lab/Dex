// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  emptyTrustStore, addKey, revokeKey, rotateKey,
  findActiveKey, isRevoked, normalizeTrustStore,
} from '../../src/main/security/trustStore';
import { generateSigningKeyPair } from '../../src/main/security/codesign';

describe('trustStore model', () => {
  it('adds a key as active and looks it up by id', () => {
    const k = generateSigningKeyPair();
    const store = addKey(emptyTrustStore(), k.publicKeyHex, { label: 'release-2026' });
    const found = findActiveKey(store, k.keyId);
    expect(found?.publicKey).toBe(k.publicKeyHex.toLowerCase());
    expect(found?.status).toBe('active');
    expect(found?.label).toBe('release-2026');
  });

  it('is idempotent on the same key and rejects a malformed key', () => {
    const k = generateSigningKeyPair();
    const s1 = addKey(emptyTrustStore(), k.publicKeyHex);
    const s2 = addKey(s1, k.publicKeyHex);
    expect(s2.keys).toHaveLength(1);
    expect(() => addKey(s1, 'abcd')).toThrow(); // not 64 hex chars
  });

  it('revokes a key so it never verifies again', () => {
    const k = generateSigningKeyPair();
    const store = revokeKey(addKey(emptyTrustStore(), k.publicKeyHex), k.keyId);
    expect(isRevoked(store, k.keyId)).toBe(true);
    expect(findActiveKey(store, k.keyId)).toBeUndefined();
  });

  it('rotates: new key trusted + active, old key revoked, with audit link', () => {
    const oldK = generateSigningKeyPair();
    const newK = generateSigningKeyPair();
    const store = rotateKey(addKey(emptyTrustStore(), oldK.publicKeyHex), oldK.keyId, newK.publicKeyHex, { label: 'rotated' });
    expect(isRevoked(store, oldK.keyId)).toBe(true);
    const active = findActiveKey(store, newK.keyId);
    expect(active?.status).toBe('active');
    expect(active?.rotatedFrom).toBe(oldK.keyId);
  });

  it('normalizes untrusted JSON: keeps valid entries, drops malformed ones', () => {
    const k = generateSigningKeyPair();
    const raw = {
      version: 1,
      keys: [
        { keyId: k.keyId, publicKey: k.publicKeyHex, status: 'active', addedAt: 1 },
        { keyId: 'bad', publicKey: 'xyz', status: 'active', addedAt: 2 },          // bad public key
        { keyId: 'bad2', publicKey: 'ab'.repeat(32), status: 'weird', addedAt: 3 }, // bad status
        null,
      ],
    };
    const store = normalizeTrustStore(raw);
    expect(store.keys).toHaveLength(1);
    expect(findActiveKey(store, k.keyId)?.publicKey).toBe(k.publicKeyHex);
    expect(normalizeTrustStore({}).keys).toEqual([]);
    expect(normalizeTrustStore(null).keys).toEqual([]);
  });
});
