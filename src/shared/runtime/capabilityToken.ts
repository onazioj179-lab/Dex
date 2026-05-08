// =============================================================================
// DEX Platform — Track A1: capability tokens (host-agnostic)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Short-lived, scope-bound, HMAC-tagged tokens that gate every preload IPC
 * call. The actual HMAC is computed by the host (Node `crypto` or Rust);
 * this module owns the scope, expiry, and verification logic so tests can
 * exercise the full state machine without crypto dependencies.
 */

import type { AppCapability } from './appContainer';

export interface CapabilityToken {
  appId: string;
  capability: AppCapability;
  /** ms since epoch — token invalid after this. */
  expiresAt: number;
  /** Monotonic per-app counter; replay protection. */
  nonce: number;
  /** HMAC-SHA256(secret, `${appId}|${capability}|${expiresAt}|${nonce}`), hex. */
  hmac: string;
}

export interface TokenVerifier {
  computeHmac(payload: string): string;
}

export function tokenPayload(t: Omit<CapabilityToken, 'hmac'>): string {
  return `${t.appId}|${t.capability}|${t.expiresAt}|${t.nonce}`;
}

export function mintToken(
  input: { appId: string; capability: AppCapability; ttlMs: number; nonce: number },
  now: number,
  verifier: TokenVerifier
): CapabilityToken {
  const expiresAt = now + Math.max(1, input.ttlMs);
  const base = { appId: input.appId, capability: input.capability, expiresAt, nonce: input.nonce };
  return { ...base, hmac: verifier.computeHmac(tokenPayload(base)) };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'bad-hmac' | 'replay' | 'wrong-app' | 'wrong-cap' };

export interface ReplayCache {
  has(appId: string, nonce: number): boolean;
  remember(appId: string, nonce: number): void;
}

export function verifyToken(
  t: CapabilityToken,
  expected: { appId: string; capability: AppCapability },
  now: number,
  verifier: TokenVerifier,
  replay: ReplayCache
): VerifyResult {
  if (t.appId !== expected.appId) return { ok: false, reason: 'wrong-app' };
  if (t.capability !== expected.capability) return { ok: false, reason: 'wrong-cap' };
  if (t.expiresAt <= now) return { ok: false, reason: 'expired' };
  const payload = tokenPayload({ appId: t.appId, capability: t.capability, expiresAt: t.expiresAt, nonce: t.nonce });
  if (verifier.computeHmac(payload) !== t.hmac) return { ok: false, reason: 'bad-hmac' };
  if (replay.has(t.appId, t.nonce)) return { ok: false, reason: 'replay' };
  replay.remember(t.appId, t.nonce);
  return { ok: true };
}

/** In-memory replay cache with LRU bound. */
export class MemoryReplayCache implements ReplayCache {
  private readonly seen = new Map<string, true>();
  constructor(private readonly max = 4096) {}
  private key(appId: string, nonce: number): string { return `${appId}:${nonce}`; }
  has(appId: string, nonce: number): boolean { return this.seen.has(this.key(appId, nonce)); }
  remember(appId: string, nonce: number): void {
    if (this.seen.size >= this.max) {
      const it = this.seen.keys().next();
      if (!it.done) this.seen.delete(it.value);
    }
    this.seen.set(this.key(appId, nonce), true);
  }
}
