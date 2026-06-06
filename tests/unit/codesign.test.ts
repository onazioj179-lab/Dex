// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  computeBundleDigest,
  signDigest,
  verifyDigestSignature,
  generateSigningKeyPair,
  keyIdForPublicKey,
  publicKeyFromPrivateHex,
} from '../../src/main/security/codesign';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const manifest = { id: 'dex.app.magnify', name: 'Magnify', version: '1.0.0' };
const files = { 'index.js': b64('export const x = 1\n'), 'ui/panel.css': b64('.a{color:red}') };

describe('codesign.computeBundleDigest', () => {
  it('is deterministic and independent of key/file order', () => {
    const a = computeBundleDigest(manifest, files);
    const b = computeBundleDigest(
      { version: '1.0.0', name: 'Magnify', id: 'dex.app.magnify' }, // reordered keys
      { 'ui/panel.css': files['ui/panel.css'], 'index.js': files['index.js'] }, // reordered files
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the manifest changes (binds the manifest)', () => {
    const a = computeBundleDigest(manifest, files);
    const c = computeBundleDigest({ ...manifest, version: '1.0.1' }, files);
    expect(a).not.toBe(c);
  });

  it('changes when any file changes (binds every file)', () => {
    const a = computeBundleDigest(manifest, files);
    const c = computeBundleDigest(manifest, { ...files, 'index.js': b64('export const x = 2\n') });
    expect(a).not.toBe(c);
  });

  it('matches the pinned known-answer vector (locks the algorithm; the CLI mirrors it)', () => {
    // Same fixed input is hashed by scripts/dex-codesign.cjs; this pins parity
    // between the publisher CLI and the runtime gate without spawning a process.
    const m = { id: 'dex.app.x', name: 'X', version: '1.0.0' };
    const f = { 'a.txt': b64('hello'), 'b.txt': b64('world') };
    expect(computeBundleDigest(m, f)).toBe(
      '6e030aea682782595c3da6ac108c5c78ea36f20fe6920cf2b74d20e370f9aa46',
    );
  });
});

describe('codesign sign/verify (Ed25519)', () => {
  it('round-trips: a signature from the private key verifies with the public key', () => {
    const { publicKeyHex, privateKeyHex, keyId } = generateSigningKeyPair();
    const digest = computeBundleDigest(manifest, files);
    const block = signDigest(digest, privateKeyHex, keyId, 1700000000000);
    expect(block).toMatchObject({ keyId, algorithm: 'ed25519', digest });
    expect(verifyDigestSignature(digest, block, publicKeyHex)).toBe(true);
  });

  it('rejects a different public key', () => {
    const signer = generateSigningKeyPair();
    const other = generateSigningKeyPair();
    const digest = computeBundleDigest(manifest, files);
    const block = signDigest(digest, signer.privateKeyHex, signer.keyId);
    expect(verifyDigestSignature(digest, block, other.publicKeyHex)).toBe(false);
  });

  it('rejects when the recomputed digest differs from the signed one (tamper)', () => {
    const { privateKeyHex, publicKeyHex, keyId } = generateSigningKeyPair();
    const digest = computeBundleDigest(manifest, files);
    const block = signDigest(digest, privateKeyHex, keyId);
    const tamperedDigest = computeBundleDigest(manifest, { ...files, 'index.js': b64('evil') });
    expect(verifyDigestSignature(tamperedDigest, block, publicKeyHex)).toBe(false);
  });

  it('keyId is the sha256(pubkey) prefix and derivable from the private key', () => {
    const { publicKeyHex, privateKeyHex, keyId } = generateSigningKeyPair();
    expect(keyId).toBe(keyIdForPublicKey(publicKeyHex));
    expect(publicKeyFromPrivateHex(privateKeyHex)).toBe(publicKeyHex);
  });
});
