// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cloud envelope encryption metadata
 * -----------------------------------------------------------------------------
 * Every cloud object is encrypted client-side before upload using AES-GCM 256
 * with a per-object Data Encryption Key (DEK). The DEK is itself wrapped by
 * a Key Encryption Key (KEK) derived from either:
 *   - the cloud-managed master key (if the user did NOT set a passphrase), or
 *   - PBKDF2-SHA256(passphrase, accountSalt, 600_000) (if E2EE is enabled)
 *
 * If the user enables passphrase E2EE, the cloud literally cannot read their
 * data. Lose the passphrase, lose the data -- which is why we make the user
 * type it twice and warn.
 *
 * This module is pure: it builds and validates the metadata envelope and
 * provides a small async crypto helper that uses globalThis.crypto.subtle
 * (available in modern Node and the renderer). The KEK / DEK handling is
 * exposed via small async functions so unit tests can pass an injected
 * crypto implementation when subtle is unavailable.
 */

// DEX v3.8.8 - cloud envelope encryption

export const KDF_ITERATIONS = 600_000;
export const KDF_SALT_BYTES = 16;
export const DEK_BYTES = 32;     // AES-256
export const NONCE_BYTES = 12;   // AES-GCM standard
export const ENVELOPE_VERSION = 1;

export type KeySource = 'cloud-managed' | 'user-passphrase';

export interface EncryptedEnvelope {
  v: number;                // envelope schema version
  alg: 'AES-GCM-256';
  keySource: KeySource;
  /** base64 of the KDF salt (only meaningful when keySource = user-passphrase). */
  saltB64?: string;
  /** base64 of the AES-GCM nonce/IV. */
  nonceB64: string;
  /** base64 of the wrapped DEK (encrypted by the KEK). */
  wrappedDekB64: string;
  /** base64 of the ciphertext + auth tag. */
  ciphertextB64: string;
  /** Plaintext byte length, for quota accounting. Authenticated as AAD. */
  plaintextBytes: number;
  /** Account id, authenticated as AAD so a stolen blob cannot be replayed. */
  accountId: string;
  createdAt: number;
}

export function buildEnvelope(parts: Omit<EncryptedEnvelope, 'v' | 'alg' | 'createdAt'> & { createdAt?: number }): EncryptedEnvelope {
  return {
    v: ENVELOPE_VERSION,
    alg: 'AES-GCM-256',
    createdAt: parts.createdAt ?? Date.now(),
    ...parts,
  };
}

export function validateEnvelope(env: unknown): env is EncryptedEnvelope {
  if (!env || typeof env !== 'object') return false;
  const e = env as Partial<EncryptedEnvelope>;
  if (e.v !== ENVELOPE_VERSION) return false;
  if (e.alg !== 'AES-GCM-256') return false;
  if (e.keySource !== 'cloud-managed' && e.keySource !== 'user-passphrase') return false;
  if (typeof e.nonceB64 !== 'string' || e.nonceB64.length === 0) return false;
  if (typeof e.wrappedDekB64 !== 'string' || e.wrappedDekB64.length === 0) return false;
  if (typeof e.ciphertextB64 !== 'string') return false;
  if (typeof e.plaintextBytes !== 'number' || e.plaintextBytes < 0) return false;
  if (typeof e.accountId !== 'string' || e.accountId.length === 0) return false;
  if (e.keySource === 'user-passphrase' && (!e.saltB64 || typeof e.saltB64 !== 'string')) return false;
  return true;
}

/** AAD bound into the AES-GCM tag so a moved/replayed blob fails to decrypt. */
export function buildAad(accountId: string, plaintextBytes: number): Uint8Array {
  const json = JSON.stringify({ a: accountId, n: plaintextBytes, v: ENVELOPE_VERSION });
  return new TextEncoder().encode(json);
}

/** Passphrase strength estimate (0..100). Used to nudge the user. */
export function passphraseStrength(passphrase: string): number {
  if (typeof passphrase !== 'string') return 0;
  let score = 0;
  if (passphrase.length >= 8) score += 20;
  if (passphrase.length >= 12) score += 20;
  if (passphrase.length >= 16) score += 10;
  if (/[A-Z]/.test(passphrase)) score += 10;
  if (/[a-z]/.test(passphrase)) score += 10;
  if (/\d/.test(passphrase)) score += 10;
  if (/[^A-Za-z0-9]/.test(passphrase)) score += 15;
  if (/(.)\1\1/.test(passphrase)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

export function passphraseAcceptable(passphrase: string): boolean {
  return passphrase.length >= 12 && passphraseStrength(passphrase) >= 50;
}

/* -------------------------------------------------------------------------- */
/* Async helpers using webcrypto subtle. These are not reached by the pure    */
/* unit tests; they exist here so the cloud uploader has one place to call.   */
/* INTENTIONAL FALLBACK: if subtle is missing (very old runtime), throws.     */
/* -------------------------------------------------------------------------- */

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) throw new Error('webcrypto.subtle unavailable');
  return c.subtle;
}

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa is available in renderer + Node 18+
  return (globalThis as { btoa?: (s: string) => string }).btoa?.(s)
    ?? Buffer.from(bytes).toString('base64');
}
function unb64(s: string): Uint8Array {
  const atob = (globalThis as { atob?: (s: string) => string }).atob;
  const raw = atob ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function deriveKekFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const s = subtle();
  const baseKey = await s.importKey('raw', new TextEncoder().encode(passphrase) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return s.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithKek(plaintext: Uint8Array, kek: CryptoKey, accountId: string): Promise<{ nonce: Uint8Array; ciphertext: Uint8Array }> {
  const s = subtle();
  const nonce = (globalThis.crypto as Crypto).getRandomValues(new Uint8Array(NONCE_BYTES));
  const aad = buildAad(accountId, plaintext.length);
  const ct = await s.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource }, kek, plaintext as BufferSource);
  return { nonce, ciphertext: new Uint8Array(ct) };
}

export async function decryptWithKek(env: EncryptedEnvelope, kek: CryptoKey): Promise<Uint8Array> {
  const s = subtle();
  const nonce = unb64(env.nonceB64);
  const ct = unb64(env.ciphertextB64);
  const aad = buildAad(env.accountId, env.plaintextBytes);
  const pt = await s.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource }, kek, ct as BufferSource);
  return new Uint8Array(pt);
}

export const _b64 = { b64, unb64 };
