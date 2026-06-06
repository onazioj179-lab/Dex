// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Developer / publisher identity (DEX Developer Platform — E1). A publisher is
 * a named identity bound to one or more Ed25519 signing keys (by keyId, the
 * 16-hex prefix produced by `keyIdForPublicKey` in security/codesign). DEX-team
 * verification flips `verified` and adds the key to the trust store, which is
 * what earns an app its "recognition" badge (e.g. Magnify as first-party).
 *
 * Pure model + validation only — no crypto, no I/O. The main-process
 * PublisherService owns persistence and the trust-store linkage.
 */

export type Recognition = 'recognized' | 'partner' | 'first-party';

export interface PublisherProfile {
  /** Reverse-DNS id, matches a package manifest's publisherId. */
  id: string;
  name: string;
  homepage?: string;
  /** 16-hex keyIds (security/codesign keyIdForPublicKey) this publisher signs with. */
  keyIds: string[];
  /** DEX-team sign-off. A verified publisher's key is in the trust store. */
  verified: boolean;
  recognition?: Recognition;
  verifiedAt?: number;
}

const REVDNS = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const KEY_ID = /^[0-9a-f]{16}$/;

/** Validate an untrusted publisher profile. Returns all problems (never throws). */
export function validatePublisher(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['publisher must be an object'];
  const p = input as Record<string, unknown>;
  if (typeof p.id !== 'string' || !REVDNS.test(p.id)) errors.push('id must be reverse-DNS (e.g. dex.app)');
  if (typeof p.name !== 'string' || p.name.trim() === '') errors.push('name is required');
  if (!Array.isArray(p.keyIds) || p.keyIds.some((k) => typeof k !== 'string' || !KEY_ID.test(k))) {
    errors.push('keyIds must be 16-hex key ids');
  }
  if (typeof p.verified !== 'boolean') errors.push('verified must be a boolean');
  if (p.recognition !== undefined && !['recognized', 'partner', 'first-party'].includes(p.recognition as string)) {
    errors.push('recognition must be recognized | partner | first-party');
  }
  return errors;
}

/** A publisher is verified when DEX signed off AND it has at least one key. */
export function isVerified(p: PublisherProfile | undefined | null): boolean {
  return !!p && p.verified === true && Array.isArray(p.keyIds) && p.keyIds.length > 0;
}

export interface RecognitionBadge {
  label: string;
  level: Recognition;
}

/** The badge to render for a publisher, or null if it is not verified. */
export function recognitionBadge(p: PublisherProfile | undefined | null): RecognitionBadge | null {
  if (!isVerified(p)) return null;
  const level = p!.recognition ?? 'recognized';
  const label = level === 'first-party' ? 'DEX' : level === 'partner' ? 'Partner' : 'Verified';
  return { label, level };
}

/** Find the publisher that owns a given signing keyId. */
export function publisherForKeyId(publishers: PublisherProfile[], keyId: string): PublisherProfile | undefined {
  return publishers.find((p) => p.keyIds.includes(keyId));
}

/** A fresh, unverified publisher record. */
export function emptyPublisher(id: string, name: string): PublisherProfile {
  return { id, name, keyIds: [], verified: false };
}
