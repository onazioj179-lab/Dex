// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX install trust gate. Sits ahead of the existing install flow and decides,
 * with no bypass, whether a package may be installed. A package installs IF AND
 * ONLY IF it carries a signature that verifies against an active key in the
 * trust store and its manifest is valid. Source/origin is irrelevant.
 *
 * Order matters and fails closed: structure -> signed? -> key trusted? ->
 * key not revoked? -> bundle not tampered? -> signature valid? -> manifest ok?
 * Any failure returns a precise reason and the package is rejected.
 */

import { computeBundleDigest, verifyDigestSignature, type SignatureBlock } from './codesign';
import { findActiveKey, isRevoked, type TrustStoreData } from './trustStore';
import { validateManifest } from '../../shared/plugins/manifest';

export type RejectReason =
  | 'malformed-package'
  | 'unsigned'
  | 'untrusted-key'
  | 'revoked-key'
  | 'tampered-bundle'
  | 'bad-signature'
  | 'bad-manifest';

export interface SignedEnvelope {
  format?: string;
  manifest?: unknown;
  files?: Record<string, string>;
  signature?: SignatureBlock;
}

export interface GateResult {
  ok: boolean;
  reason?: RejectReason;
  /** Human-readable explanation for the UI. */
  detail?: string;
  keyId?: string;
  manifestId?: string;
}

const REASON_TEXT: Record<RejectReason, string> = {
  'malformed-package': 'Package is malformed.',
  'unsigned': 'Package is not signed by a DEX key.',
  'untrusted-key': 'Signed by a key DEX does not trust.',
  'revoked-key': 'Signed by a revoked key.',
  'tampered-bundle': 'Bundle contents do not match the signature (tampered).',
  'bad-signature': 'Signature is invalid.',
  'bad-manifest': 'Manifest is invalid.',
};

/** Human-readable text for a rejection reason (for the failure UX). */
export function rejectionMessage(reason: RejectReason): string {
  return REASON_TEXT[reason];
}

function reject(reason: RejectReason, detail?: string, keyId?: string): GateResult {
  return { ok: false, reason, detail: detail ?? REASON_TEXT[reason], keyId };
}

/**
 * The mandatory verification pipeline. Pure: takes the package envelope and the
 * trust store, returns an allow/deny verdict. The caller (install flow) must
 * refuse to unpack or register anything unless `ok` is true.
 */
export function verifySignedPackage(envelope: SignedEnvelope, trust: TrustStoreData): GateResult {
  // 1. Structure.
  if (!envelope || typeof envelope !== 'object' || !envelope.manifest || !envelope.files) {
    return reject('malformed-package');
  }
  // 2. Signed?
  const block = envelope.signature;
  if (!block || typeof block.signature !== 'string' || typeof block.keyId !== 'string') {
    return reject('unsigned');
  }
  // 3. Trust lookup. Revoked is reported distinctly from unknown.
  if (isRevoked(trust, block.keyId)) return reject('revoked-key', undefined, block.keyId);
  const key = findActiveKey(trust, block.keyId);
  if (!key) return reject('untrusted-key', undefined, block.keyId);
  // 4. Recompute the digest independently and check the claimed digest (tamper).
  const digest = computeBundleDigest(envelope.manifest, envelope.files);
  if (digest !== block.digest) return reject('tampered-bundle', 'recomputed digest does not match', block.keyId);
  // 5. Verify the signature over the recomputed digest with the trusted key.
  if (!verifyDigestSignature(digest, block, key.publicKey)) return reject('bad-signature', undefined, block.keyId);
  // 6. Validate the manifest (id format, version, capabilities).
  const v = validateManifest(envelope.manifest);
  if (!v.valid) return reject('bad-manifest', v.errors.join('; '), block.keyId);

  const manifestId = String((envelope.manifest as { id?: unknown }).id ?? '');
  return { ok: true, keyId: block.keyId, manifestId };
}
