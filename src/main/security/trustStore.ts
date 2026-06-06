// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX trust store: the set of public keys DEX trusts to sign installable app
 * packages. Holds public keys ONLY. Supports multiple keys, rotation, and
 * revocation. A revoked key never verifies again.
 *
 * The model operations are pure (testable); persistence is a thin JSON layer
 * the main process points at `userData/dex-trust-store.json`.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { keyIdForPublicKey } from './codesign';

export type KeyStatus = 'active' | 'revoked';

export interface TrustedKey {
  /** sha256(pubkey) prefix — also what a signature block references. */
  keyId: string;
  /** Raw Ed25519 public key, 64 hex chars. */
  publicKey: string;
  status: KeyStatus;
  addedAt: number;
  /** Optional human label, e.g. "DEX release key 2026". */
  label?: string;
  /** keyId of the key this one replaced, when added via rotation. */
  rotatedFrom?: string;
}

export interface TrustStoreData {
  version: 1;
  keys: TrustedKey[];
}

export function emptyTrustStore(): TrustStoreData {
  return { version: 1, keys: [] };
}

/** A trusted key usable for verification: present AND active. */
export function findActiveKey(store: TrustStoreData, keyId: string): TrustedKey | undefined {
  return store.keys.find((k) => k.keyId === keyId && k.status === 'active');
}

export function isRevoked(store: TrustStoreData, keyId: string): boolean {
  return store.keys.some((k) => k.keyId === keyId && k.status === 'revoked');
}

export function findKey(store: TrustStoreData, keyId: string): TrustedKey | undefined {
  return store.keys.find((k) => k.keyId === keyId);
}

/**
 * Add a trusted public key (active). Idempotent on keyId; throws on a malformed
 * key or if the keyId already exists with a different public key. Returns a new
 * store (immutable).
 */
export function addKey(
  store: TrustStoreData,
  publicKeyHex: string,
  opts: { label?: string; now?: number; rotatedFrom?: string } = {},
): TrustStoreData {
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) {
    throw new Error('public key must be 64 hex chars (32-byte Ed25519)');
  }
  const keyId = keyIdForPublicKey(publicKeyHex);
  const existing = findKey(store, keyId);
  if (existing) {
    if (existing.publicKey.toLowerCase() !== publicKeyHex.toLowerCase()) {
      throw new Error(`keyId ${keyId} already present with a different public key`);
    }
    return store; // already trusted
  }
  const entry: TrustedKey = {
    keyId,
    publicKey: publicKeyHex.toLowerCase(),
    status: 'active',
    addedAt: opts.now ?? Date.now(),
    label: opts.label,
    rotatedFrom: opts.rotatedFrom,
  };
  return { ...store, keys: [...store.keys, entry] };
}

/** Revoke a key by id. A revoked key can never verify again. Returns new store. */
export function revokeKey(store: TrustStoreData, keyId: string): TrustStoreData {
  return {
    ...store,
    keys: store.keys.map((k) => (k.keyId === keyId ? { ...k, status: 'revoked' as const } : k)),
  };
}

/**
 * Rotate: trust a new key and revoke the old one in one step. The new key
 * records `rotatedFrom` for auditability. Returns a new store.
 */
export function rotateKey(
  store: TrustStoreData,
  oldKeyId: string,
  newPublicKeyHex: string,
  opts: { label?: string; now?: number } = {},
): TrustStoreData {
  const added = addKey(store, newPublicKeyHex, { ...opts, rotatedFrom: oldKeyId });
  return revokeKey(added, oldKeyId);
}

// ---------------------------------------------------------------------------
// Persistence (main process)
// ---------------------------------------------------------------------------

/** Parse + sanitize untrusted trust-store JSON, dropping malformed entries. Pure. */
export function normalizeTrustStore(data: unknown): TrustStoreData {
  if (!data || typeof data !== 'object') return emptyTrustStore();
  const d = data as Partial<TrustStoreData>;
  if (!Array.isArray(d.keys)) return emptyTrustStore();
  // Drop any malformed entries defensively.
  const keys = d.keys.filter(
    (k): k is TrustedKey =>
      !!k && typeof k.keyId === 'string' && /^[0-9a-f]{64}$/i.test(String(k.publicKey)) &&
      (k.status === 'active' || k.status === 'revoked'),
  );
  return { version: 1, keys };
}

export function loadTrustStore(filePath: string): TrustStoreData {
  try {
    if (!existsSync(filePath)) return emptyTrustStore();
    return normalizeTrustStore(JSON.parse(readFileSync(filePath, 'utf-8')));
  } catch {
    return emptyTrustStore();
  }
}

export function saveTrustStore(filePath: string, data: TrustStoreData): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
