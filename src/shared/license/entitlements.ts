// =============================================================================
// DEX Platform — Track C3: entitlements + offline grace
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Per-app entitlement evaluator. The signed JWT verification happens in
 * the host (via existing creator_key); this module decides whether an
 * entitlement is currently honored, including offline grace, device
 * pairing constraints, and refund windows.
 */

export interface Entitlement {
  packageId: string;
  /** Stable license id. */
  licenseId: string;
  /** Reverse-DNS of issuer. */
  issuer: string;
  /** Devices this license is bound to (max 5 for personal). */
  deviceIds: string[];
  /** ISO timestamp issued. */
  issuedAt: string;
  /** Optional ISO expiry. */
  expiresAt?: string;
  /** Last server-side validation timestamp. */
  lastValidatedAt: string;
  /** Whether this is a refundable purchase. */
  refundable?: { purchasedAt: string; windowDays: number };
  /** Tier ('free' | 'pro' | 'team' | 'edu' | string). */
  tier: string;
}

export interface EntitlementContext {
  now: number;            // ms
  thisDeviceId: string;
  /** How long offline is OK before forcing reauth. Default 30d. */
  offlineGraceDays?: number;
}

export type EntitlementVerdict =
  | { ok: true; tier: string }
  | { ok: false; reason: 'expired' | 'wrong-device' | 'offline-grace-exceeded' | 'refunded' | 'unknown-issuer' };

const DAY_MS = 24 * 3600 * 1000;

export function evaluateEntitlement(e: Entitlement, ctx: EntitlementContext): EntitlementVerdict {
  if (!e.deviceIds.includes(ctx.thisDeviceId)) return { ok: false, reason: 'wrong-device' };
  if (e.expiresAt && Date.parse(e.expiresAt) <= ctx.now) return { ok: false, reason: 'expired' };
  if (e.refundable) {
    const purchased = Date.parse(e.refundable.purchasedAt);
    const windowEnd = purchased + e.refundable.windowDays * DAY_MS;
    // Within window with no validation since purchase = consider refunded
    // only when caller explicitly knows; we just expose the boundary.
    if (Date.parse(e.lastValidatedAt) > windowEnd && ctx.now < purchased) {
      return { ok: false, reason: 'refunded' };
    }
  }
  const grace = (ctx.offlineGraceDays ?? 30) * DAY_MS;
  if (ctx.now - Date.parse(e.lastValidatedAt) > grace) {
    return { ok: false, reason: 'offline-grace-exceeded' };
  }
  return { ok: true, tier: e.tier };
}

/** Pairing token issued by an existing device to authorize a new one. */
export interface PairingChallenge {
  /** Six-digit user-readable code (string with leading zeros). */
  code: string;
  /** Underlying nonce (hex). */
  nonce: string;
  /** Validity ms. */
  ttlMs: number;
  /** Created at (ms). */
  createdAt: number;
}

export function isPairingValid(c: PairingChallenge, now: number): boolean {
  return now - c.createdAt < c.ttlMs;
}

export function formatPairingCode(n: number): string {
  return (Math.abs(n) % 1_000_000).toString().padStart(6, '0');
}
