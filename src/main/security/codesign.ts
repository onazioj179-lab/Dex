// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX code-signing core. The cryptographic primitives for the install trust
 * gate: a canonical bundle digest (manifest + every file) and Ed25519 sign /
 * verify. Trust comes from the signature, not the origin.
 *
 * Crypto is Node's built-in `crypto` (OpenSSL-backed Ed25519) — a vetted
 * library, not hand-rolled. `crypto.verify` for Ed25519 is constant-time.
 * Keys are handled as raw 32-byte hex (matching native/creator_key.rs), wrapped
 * into KeyObjects via the fixed Ed25519 DER prefixes (encoding only, not crypto).
 *
 * The private signing key never lives here, in the build, or in the runtime —
 * it is supplied to the publisher CLI from a path/env the publisher controls.
 * DEX embeds and stores public keys only.
 */

import {
  createHash, createPublicKey, createPrivateKey,
  sign as edSign, verify as edVerify, generateKeyPairSync,
  type KeyObject,
} from 'crypto';

export const SIGNING_ALGORITHM = 'ed25519' as const;
export const DIGEST_VERSION = 'dexsig-v1';

export interface SignatureBlock {
  /** Identifies which trusted key signed this (sha256(pubkey) prefix). */
  keyId: string;
  algorithm: typeof SIGNING_ALGORITHM;
  /** The canonical bundle digest that was signed (sha256 hex). */
  digest: string;
  /** Ed25519 signature over the digest bytes, hex. */
  signature: string;
  /** Unix milliseconds the signature was produced. */
  signedAt: number;
}

// Fixed ASN.1/DER prefixes that turn a raw 32-byte Ed25519 key into the
// SPKI (public) / PKCS8 (private seed) encoding Node's crypto accepts.
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function publicKeyFromHex(hex: string): KeyObject {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes (64 hex chars)');
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

function privateKeyFromHex(hex: string): KeyObject {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== 32) throw new Error('ed25519 private key seed must be 32 bytes (64 hex chars)');
  return createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
}

/** Stable key id for a public key: first 16 hex chars of sha256(pubkey bytes). */
export function keyIdForPublicKey(publicKeyHex: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex').slice(0, 16);
}

/** Recursively sort object keys so equal data always serializes identically. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = canonicalize(src[k]);
    return out;
  }
  return value;
}

/**
 * Canonical SHA-256 digest over the manifest plus a hash of every file in the
 * bundle. Files are keyed path -> base64 (the dexplug envelope shape). Any
 * change to the manifest or any file changes the digest, so the signature
 * breaks. Deterministic: independent of key order and file order.
 */
export function computeBundleDigest(manifest: unknown, files: Record<string, string>): string {
  const h = createHash('sha256');
  h.update(DIGEST_VERSION);
  h.update('\n');
  h.update('manifest\0');
  h.update(JSON.stringify(canonicalize(manifest)));
  h.update('\0');
  for (const filePath of Object.keys(files).sort()) {
    const fileHash = createHash('sha256').update(Buffer.from(files[filePath], 'base64')).digest('hex');
    h.update(filePath);
    h.update('\0');
    h.update(fileHash);
    h.update('\0');
  }
  return h.digest('hex');
}

/** Sign a bundle digest with a raw-hex Ed25519 private key (publisher side). */
export function signDigest(
  digestHex: string,
  privateKeyHex: string,
  keyId: string,
  now: number = Date.now(),
): SignatureBlock {
  const signature = edSign(null, Buffer.from(digestHex, 'hex'), privateKeyFromHex(privateKeyHex));
  return {
    keyId,
    algorithm: SIGNING_ALGORITHM,
    digest: digestHex,
    signature: signature.toString('hex'),
    signedAt: now,
  };
}

/**
 * Verify a signature block against an *independently recomputed* digest and a
 * trusted public key. Returns false (never throws) on any mismatch: wrong
 * algorithm, claimed-vs-actual digest mismatch (tamper), or bad signature.
 */
export function verifyDigestSignature(
  recomputedDigestHex: string,
  block: SignatureBlock | undefined | null,
  publicKeyHex: string,
): boolean {
  if (!block || block.algorithm !== SIGNING_ALGORITHM) return false;
  if (typeof block.digest !== 'string' || block.digest !== recomputedDigestHex) return false;
  if (typeof block.signature !== 'string' || block.signature.length === 0) return false;
  try {
    return edVerify(
      null,
      Buffer.from(recomputedDigestHex, 'hex'),
      publicKeyFromHex(publicKeyHex),
      Buffer.from(block.signature, 'hex'),
    );
  } catch {
    return false;
  }
}

/** Generate a fresh Ed25519 keypair as raw hex (publisher keygen convenience). */
export function generateSigningKeyPair(): { publicKeyHex: string; privateKeyHex: string; keyId: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).subarray(-32);
  const seed = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' })).subarray(-32);
  const publicKeyHex = pub.toString('hex');
  return { publicKeyHex, privateKeyHex: seed.toString('hex'), keyId: keyIdForPublicKey(publicKeyHex) };
}

/** Derive the public key (raw hex) from a raw-hex private seed. */
export function publicKeyFromPrivateHex(privateKeyHex: string): string {
  const keyObj = privateKeyFromHex(privateKeyHex);
  const pub = createPublicKey(keyObj);
  return Buffer.from(pub.export({ format: 'der', type: 'spki' })).subarray(-32).toString('hex');
}
