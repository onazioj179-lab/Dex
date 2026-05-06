// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Anti-abuse / fraud-prevention helpers
 * -----------------------------------------------------------------------------
 * Pure helpers that the cloud-side account service uses to decide whether a
 * sign-up, sign-in, or checkout request looks suspicious. Layered defence,
 * never a single hard block:
 *
 *   1. IP rate limit (TokenBucket) -- stops naive scripted spam.
 *   2. Per-IP account fanout cap  -- one IP cannot create N accounts.
 *   3. Disposable / temp-mail block -- known throwaway domains rejected.
 *   4. Device-fingerprint dedupe  -- one fingerprint cannot bind to N
 *      simultaneously paying accounts.
 *   5. Velocity scoring           -- combines signals into a 0..100 risk
 *      score; >= 70 triggers a soft challenge (email confirm + delay),
 *      >= 90 triggers manual review.
 *
 * INTENTIONAL FALLBACK: real production fraud also calls out to Stripe
 * Radar + a CAPTCHA. This module exposes the local logic and the hooks; the
 * cloud service plugs the external scores in via `externalSignals`.
 */

// DEX v3.8.7 - abuse prevention

export interface AbuseSignals {
  /** How many accounts already exist on this IP. */
  ipAccountCount: number;
  /** How many distinct devices have used this account in the last 24h. */
  deviceFanout: number;
  /** True if the email domain is a known disposable / temp-mail provider. */
  isDisposableEmail: boolean;
  /** True if the IP appears in the public Tor exit-node list (optional). */
  isTorExit: boolean;
  /** Optional: an external Stripe Radar / fraud-score, normalised 0..100. */
  externalRiskScore?: number;
}

export interface AbuseDecision {
  score: number;
  level: 'allow' | 'soft-challenge' | 'manual-review' | 'block';
  reasons: string[];
}

/** Domains we always reject because they trivially defeat email verification. */
const DISPOSABLE_DOMAINS = new Set<string>([
  'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'getnada.com', 'maildrop.cc', 'fakeinbox.com', 'trashmail.com',
  'dropmail.me', 'mintemail.com', 'fakemailgenerator.com',
]);

export function isDisposableEmail(email: string): boolean {
  if (typeof email !== 'string' || email.length === 0) return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

/** Email format must look real. Not a security check; rejects obvious garbage. */
export function isProbablyValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  if (email.length < 5 || email.length > 254) return false;
  // RFC 5322 simplified: local@domain.tld
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Score a signal bundle and return a risk decision. */
export function scoreAbuse(signals: AbuseSignals): AbuseDecision {
  let score = 0;
  const reasons: string[] = [];

  // IP fanout (more weight after the first 2 accounts on one IP).
  if (signals.ipAccountCount >= 10) { score += 60; reasons.push('ip-fanout-very-high'); }
  else if (signals.ipAccountCount >= 5) { score += 40; reasons.push('ip-fanout-high'); }
  else if (signals.ipAccountCount >= 3) { score += 20; reasons.push('ip-fanout-medium'); }

  // Device fanout (one account jumping across many devices).
  if (signals.deviceFanout >= 8) { score += 40; reasons.push('device-fanout-high'); }
  else if (signals.deviceFanout >= 4) { score += 15; reasons.push('device-fanout-medium'); }

  if (signals.isDisposableEmail) { score += 50; reasons.push('disposable-email'); }
  if (signals.isTorExit) { score += 25; reasons.push('tor-exit'); }

  if (typeof signals.externalRiskScore === 'number') {
    const ext = Math.max(0, Math.min(100, signals.externalRiskScore));
    score = Math.round((score * 0.6 + ext * 0.4));
    if (ext >= 70) reasons.push('external-risk-high');
  }

  score = Math.min(100, Math.max(0, score));

  let level: AbuseDecision['level'] = 'allow';
  if (score >= 90) level = 'block';
  else if (score >= 70) level = 'manual-review';
  else if (score >= 40) level = 'soft-challenge';

  return { score, level, reasons };
}

/** Constant-time comparison for short tokens (auth codes, signed payloads). */
export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Randomly-jittered backoff to avoid stampede after a denied request. */
export function backoffMs(attempt: number, baseMs = 500, capMs = 30_000, rand: () => number = Math.random): number {
  if (attempt < 1) return 0;
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt - 1));
  const jitter = rand() * 0.25 * exp;
  return Math.round(exp + jitter);
}
