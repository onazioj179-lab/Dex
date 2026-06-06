// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { verifySignedPackage } from '../../src/main/security/codeSigningGate';
import { computeBundleDigest, signDigest, generateSigningKeyPair } from '../../src/main/security/codesign';
import { emptyTrustStore, addKey, revokeKey } from '../../src/main/security/trustStore';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const goodManifest = { id: 'dex.app.magnify', name: 'Magnify', version: '1.0.0' };
const files = { 'index.js': b64('export const x = 1\n') };

function signedEnvelope(manifest: unknown, fileSet: Record<string, string>, signer = generateSigningKeyPair()) {
  const digest = computeBundleDigest(manifest, fileSet);
  const signature = signDigest(digest, signer.privateKeyHex, signer.keyId);
  return { envelope: { format: 'dexplug-v1', manifest, files: fileSet, signature }, signer };
}

describe('codeSigningGate.verifySignedPackage', () => {
  it('accepts a package signed by a trusted active key', () => {
    const { envelope, signer } = signedEnvelope(goodManifest, files);
    const trust = addKey(emptyTrustStore(), signer.publicKeyHex);
    const r = verifySignedPackage(envelope, trust);
    expect(r.ok).toBe(true);
    expect(r.keyId).toBe(signer.keyId);
    expect(r.manifestId).toBe('dex.app.magnify');
  });

  it('rejects an unsigned package', () => {
    const r = verifySignedPackage({ manifest: goodManifest, files }, emptyTrustStore());
    expect(r).toMatchObject({ ok: false, reason: 'unsigned' });
  });

  it('rejects an unknown (untrusted) key', () => {
    const { envelope } = signedEnvelope(goodManifest, files);
    const r = verifySignedPackage(envelope, emptyTrustStore());
    expect(r).toMatchObject({ ok: false, reason: 'untrusted-key' });
  });

  it('rejects a revoked key', () => {
    const { envelope, signer } = signedEnvelope(goodManifest, files);
    const trust = revokeKey(addKey(emptyTrustStore(), signer.publicKeyHex), signer.keyId);
    const r = verifySignedPackage(envelope, trust);
    expect(r).toMatchObject({ ok: false, reason: 'revoked-key', keyId: signer.keyId });
  });

  it('rejects a tampered bundle (file changed after signing)', () => {
    const { envelope, signer } = signedEnvelope(goodManifest, files);
    const trust = addKey(emptyTrustStore(), signer.publicKeyHex);
    envelope.files = { ...envelope.files, 'index.js': b64('export const x = 999 // tampered\n') };
    const r = verifySignedPackage(envelope, trust);
    expect(r).toMatchObject({ ok: false, reason: 'tampered-bundle' });
  });

  it('rejects a bad signature (digest matches, signature bytes corrupted)', () => {
    const { envelope, signer } = signedEnvelope(goodManifest, files);
    const trust = addKey(emptyTrustStore(), signer.publicKeyHex);
    const sig = envelope.signature.signature;
    envelope.signature.signature = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    const r = verifySignedPackage(envelope, trust);
    expect(r).toMatchObject({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a bad manifest even when correctly signed', () => {
    const bad = { id: 'Not A Slug', name: '', version: 'nope' };
    const { envelope, signer } = signedEnvelope(bad, files);
    const trust = addKey(emptyTrustStore(), signer.publicKeyHex);
    const r = verifySignedPackage(envelope, trust);
    expect(r).toMatchObject({ ok: false, reason: 'bad-manifest' });
  });

  it('rejects a malformed package', () => {
    expect(verifySignedPackage({}, emptyTrustStore())).toMatchObject({ ok: false, reason: 'malformed-package' });
  });
});
