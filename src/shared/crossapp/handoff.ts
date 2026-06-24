// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-device activity handoff model (DEX_FEATURE_BACKLOG 09).
 *
 * Mirrors Apple Handoff's security posture: a device ADVERTISES a user activity
 * (the app + a small state payload), and another device may CONTINUE it only when
 * the two are paired/trusted (same account), the advertisement is fresh (Handoff
 * advertisements are short-lived), and the payload is intact. Pure policy — the
 * transport (BLE advertise / encrypted channel) is the host's job; this owns the
 * trust + freshness + integrity rules so they stay testable.
 */

export interface UserActivity {
  /** Activity type, e.g. "com.dex.notes.edit". */
  type: string;
  /** The originating device id. */
  deviceId: string;
  /** Small, opaque continuation payload (e.g. doc id + caret). */
  payload: Record<string, unknown>;
  /** When the advertisement was created (ms epoch). */
  createdAt: number;
  /** Integrity tag over the payload (HMAC in the real transport). */
  tag: string;
}

export interface HandoffPolicy {
  /** Device ids the local device is paired/trusted with (same account). */
  trustedDevices: ReadonlySet<string>;
  /** Max advertisement age before it is considered stale (default 60s). */
  maxAgeMs?: number;
}

export interface HandoffDecision {
  ok: boolean;
  reason: string;
}

const DEFAULT_MAX_AGE_MS = 60_000;

/**
 * Decide whether the local device may continue an advertised activity. Fail-closed:
 * an untrusted origin, a stale advertisement, or a tampered payload is rejected.
 * `computeTag` recomputes the integrity tag the way the advertiser did.
 */
export function canContinueActivity(
  activity: UserActivity,
  policy: HandoffPolicy,
  now: number,
  computeTag: (a: UserActivity) => string,
): HandoffDecision {
  if (!policy.trustedDevices.has(activity.deviceId)) {
    return { ok: false, reason: 'origin device is not paired/trusted' };
  }
  const maxAge = policy.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const age = now - activity.createdAt;
  if (age < 0) return { ok: false, reason: 'advertisement timestamp is in the future' };
  if (age > maxAge) return { ok: false, reason: `advertisement is stale (${age}ms > ${maxAge}ms)` };
  if (computeTag(activity) !== activity.tag) {
    return { ok: false, reason: 'payload integrity check failed (tampered or wrong key)' };
  }
  return { ok: true, reason: 'ok' };
}

/** Whether an advertisement is still fresh enough to surface in the handoff UI. */
export function isAdvertisementFresh(activity: UserActivity, now: number, maxAgeMs = DEFAULT_MAX_AGE_MS): boolean {
  const age = now - activity.createdAt;
  return age >= 0 && age <= maxAgeMs;
}
