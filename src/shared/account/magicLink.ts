// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Magic-link sign-in tokens.
 *
 * One-time, time-bound, device-bound tokens. The cloud function generates
 * the token, signs it server-side, and emails the link. The renderer
 * verifies the shape locally before sending it back.
 */

// DEX v3.8.9 - magic links

export interface MagicLinkToken {
  /** Random opaque body, 24+ url-safe bytes. */
  body: string;
  /** Email this token was issued to (lowercased + canonicalised). */
  email: string;
  issuedAt: number;
  expiresAt: number;
  /** Optional device fingerprint binding. */
  fingerprint?: string;
  /** Single-use marker (cloud must consume). */
  consumed?: boolean;
}

export const MAGIC_LINK_LIFETIME_MS = 10 * 60 * 1000;   // 10 minutes
export const MAGIC_LINK_MIN_BODY = 24;

export function buildMagicLink(args: {
  body: string;
  email: string;
  fingerprint?: string;
  now?: number;
  lifetimeMs?: number;
}): MagicLinkToken {
  const now = args.now ?? Date.now();
  return {
    body: args.body,
    email: args.email,
    fingerprint: args.fingerprint,
    issuedAt: now,
    expiresAt: now + (args.lifetimeMs ?? MAGIC_LINK_LIFETIME_MS),
  };
}

export type MagicLinkProblem =
  | 'expired'
  | 'consumed'
  | 'fingerprint-mismatch'
  | 'short-body'
  | 'email-mismatch';

export function verifyMagicLink(args: {
  token: MagicLinkToken;
  presentedEmail: string;
  presentedFingerprint?: string;
  now?: number;
}): { ok: true } | { ok: false; reason: MagicLinkProblem } {
  if (args.token.body.length < MAGIC_LINK_MIN_BODY) return { ok: false, reason: 'short-body' };
  if (args.token.consumed) return { ok: false, reason: 'consumed' };
  const now = args.now ?? Date.now();
  if (now > args.token.expiresAt) return { ok: false, reason: 'expired' };
  if (args.token.email.toLowerCase() !== args.presentedEmail.toLowerCase()) return { ok: false, reason: 'email-mismatch' };
  if (args.token.fingerprint && args.token.fingerprint !== args.presentedFingerprint) return { ok: false, reason: 'fingerprint-mismatch' };
  return { ok: true };
}

export function consumeMagicLink(t: MagicLinkToken): MagicLinkToken {
  return { ...t, consumed: true };
}
