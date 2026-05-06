// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Legacy / inactivity handover
 * -----------------------------------------------------------------------------
 * If you stop using DEX for a long time -- a hospital stay, an accident, a
 * passing -- the people you trust should still be able to reach your work.
 * This is the local data model and decision logic for the optional handover
 * system. Off by default, fully under user control, never automatic.
 *
 * Lifecycle:
 *   1. user nominates one or more heirs (email + relationship + share level)
 *   2. user sets `inactivityDays` (default 90; allowed 30..365)
 *   3. cloud cron compares lastActivityAt; once threshold passes, status
 *      moves from `idle` -> `pending-challenge` and an email is sent to the
 *      account owner ("are you still there?")
 *   4. if owner responds within 14 days -> reset to `idle`
 *   5. if no response -> `challenge-sent` to heirs (with one-time link)
 *   6. heir confirms -> `transferred` (read-only by default; full only if
 *      shareLevel=full was selected by the owner up front)
 *
 * This module is pure: it returns the next state and the actions to take.
 * Sending email + writing audit log is the cloud function's job.
 */

// DEX v3.8.8 - legacy / inactivity handover

export type HeirShareLevel = 'read-only' | 'full';
export type HandoverStatus = 'idle' | 'pending-challenge' | 'challenge-sent' | 'transferred' | 'cancelled';

export interface Heir {
  id: string;
  email: string;
  relationship: string;     // 'spouse', 'child', 'lawyer', 'friend', etc.
  shareLevel: HeirShareLevel;
  addedAt: number;
}

export interface HandoverPlan {
  enabled: boolean;
  heirs: Heir[];
  /** Days of inactivity before triggering the challenge. 30..365. */
  inactivityDays: number;
  /** Days the owner has to respond to the challenge. */
  challengeWindowDays: number;
  status: HandoverStatus;
  lastActivityAt: number;
  challengeSentAt: number;
  transferredAt: number;
}

export const HANDOVER_DEFAULTS = {
  inactivityDays: 90,
  challengeWindowDays: 14,
  minInactivityDays: 30,
  maxInactivityDays: 365,
} as const;

export function createHandoverPlan(): HandoverPlan {
  return {
    enabled: false,
    heirs: [],
    inactivityDays: HANDOVER_DEFAULTS.inactivityDays,
    challengeWindowDays: HANDOVER_DEFAULTS.challengeWindowDays,
    status: 'idle',
    lastActivityAt: Date.now(),
    challengeSentAt: 0,
    transferredAt: 0,
  };
}

export interface ValidationResult { ok: boolean; reason?: string; }

export function validateHandoverPlan(p: HandoverPlan): ValidationResult {
  if (!p.enabled) return { ok: true };
  if (p.heirs.length === 0) return { ok: false, reason: 'no-heirs' };
  if (p.heirs.length > 5) return { ok: false, reason: 'too-many-heirs' };
  if (p.inactivityDays < HANDOVER_DEFAULTS.minInactivityDays) return { ok: false, reason: 'inactivity-too-short' };
  if (p.inactivityDays > HANDOVER_DEFAULTS.maxInactivityDays) return { ok: false, reason: 'inactivity-too-long' };
  if (p.challengeWindowDays < 1 || p.challengeWindowDays > 30) return { ok: false, reason: 'window-out-of-range' };
  for (const h of p.heirs) {
    if (!h.email.includes('@')) return { ok: false, reason: 'bad-heir-email' };
  }
  return { ok: true };
}

export type HandoverAction =
  | { kind: 'none' }
  | { kind: 'send-owner-challenge' }
  | { kind: 'send-heir-notice' }
  | { kind: 'transfer' };

export interface HandoverDecision {
  next: HandoverStatus;
  action: HandoverAction;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure decision: given the plan + now, what state should it be in next? */
export function decideHandover(plan: HandoverPlan, now: number = Date.now()): HandoverDecision {
  if (!plan.enabled || plan.heirs.length === 0) return { next: 'idle', action: { kind: 'none' } };
  if (plan.status === 'transferred' || plan.status === 'cancelled') {
    return { next: plan.status, action: { kind: 'none' } };
  }
  const inactivityMs = plan.inactivityDays * DAY_MS;
  const idleFor = now - plan.lastActivityAt;

  if (plan.status === 'idle') {
    if (idleFor >= inactivityMs) {
      return { next: 'pending-challenge', action: { kind: 'send-owner-challenge' } };
    }
    return { next: 'idle', action: { kind: 'none' } };
  }

  if (plan.status === 'pending-challenge') {
    const challengeWindowMs = plan.challengeWindowDays * DAY_MS;
    const sinceChallenge = now - plan.challengeSentAt;
    if (sinceChallenge >= challengeWindowMs) {
      return { next: 'challenge-sent', action: { kind: 'send-heir-notice' } };
    }
    return { next: 'pending-challenge', action: { kind: 'none' } };
  }

  if (plan.status === 'challenge-sent') {
    // Heirs have 30 days to claim. If none claim, stay in this state.
    return { next: 'challenge-sent', action: { kind: 'none' } };
  }

  return { next: plan.status, action: { kind: 'none' } };
}

/** Owner came back. Resets to idle. */
export function ownerSawChallenge(plan: HandoverPlan, now: number = Date.now()): HandoverPlan {
  return { ...plan, status: 'idle', lastActivityAt: now, challengeSentAt: 0 };
}

/** Heir confirmed identity. Marks transferred. */
export function confirmHeirHandover(plan: HandoverPlan, now: number = Date.now()): HandoverPlan {
  return { ...plan, status: 'transferred', transferredAt: now };
}

/** Owner cancels the entire arrangement. */
export function cancelHandover(plan: HandoverPlan): HandoverPlan {
  return { ...plan, status: 'cancelled', enabled: false };
}
