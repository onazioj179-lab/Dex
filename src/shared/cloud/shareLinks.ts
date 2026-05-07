// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Time-bound shareable link tokens.
 *
 * Cloud-side token for "share this with one click". Holds the file ref,
 * permission level, and an optional passphrase hash. Expires + supports
 * one-time consumption.
 */

// DEX v3.8.9 - share links

export type SharePermission = 'view' | 'comment' | 'edit';

export interface ShareLinkToken {
  id: string;                        // public id, used in URL
  resourceRef: string;               // opaque resource pointer
  permission: SharePermission;
  createdAt: number;
  expiresAt: number;
  /** SHA-256 hex of optional passphrase. Empty = no passphrase. */
  passphraseHash?: string;
  /** Maximum number of opens (0 = unlimited). */
  maxOpens: number;
  opens: number;
  revokedAt?: number;
}

export const DEFAULT_SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function createShareLink(args: {
  id: string;
  resourceRef: string;
  permission: SharePermission;
  passphraseHash?: string;
  lifetimeMs?: number;
  maxOpens?: number;
  now?: number;
}): ShareLinkToken {
  const now = args.now ?? Date.now();
  return {
    id: args.id,
    resourceRef: args.resourceRef,
    permission: args.permission,
    createdAt: now,
    expiresAt: now + (args.lifetimeMs ?? DEFAULT_SHARE_LIFETIME_MS),
    passphraseHash: args.passphraseHash,
    maxOpens: args.maxOpens ?? 0,
    opens: 0,
  };
}

export type ShareProblem = 'expired' | 'revoked' | 'opens-exceeded' | 'passphrase-required' | 'passphrase-wrong';

export function tryOpenShare(token: ShareLinkToken, presented: { passphraseHash?: string; now?: number }): { ok: true; token: ShareLinkToken } | { ok: false; reason: ShareProblem } {
  if (token.revokedAt) return { ok: false, reason: 'revoked' };
  const now = presented.now ?? Date.now();
  if (now > token.expiresAt) return { ok: false, reason: 'expired' };
  if (token.maxOpens > 0 && token.opens >= token.maxOpens) return { ok: false, reason: 'opens-exceeded' };
  if (token.passphraseHash) {
    if (!presented.passphraseHash) return { ok: false, reason: 'passphrase-required' };
    if (presented.passphraseHash !== token.passphraseHash) return { ok: false, reason: 'passphrase-wrong' };
  }
  return { ok: true, token: { ...token, opens: token.opens + 1 } };
}

export function revokeShare(token: ShareLinkToken, now: number = Date.now()): ShareLinkToken {
  return { ...token, revokedAt: now };
}
