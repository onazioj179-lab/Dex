// =============================================================================
// DEX Platform — Phase 2: Capability broker
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * High-level capability gating used by the IPC layer. Combines
 * permissionsPolicy grants (user-facing) with capabilityToken minting
 * (per-message machine-checked tokens) and emits an audit trail.
 *
 * Pure logic: caller provides the grant lookup, the HMAC verifier, and a
 * monotonic clock.
 */

import {
  mintToken, verifyToken, type CapabilityToken, type TokenVerifier, MemoryReplayCache,
} from './capabilityToken';
import type { AppCapability } from './appContainer';

export interface GrantLookup {
  /** Returns true iff the app currently holds an unexpired user grant for this cap. */
  isGranted(appId: string, capability: AppCapability, now: number): boolean;
}

export interface AuditSink {
  record(event: AuditEvent): void;
}

export type AuditEvent =
  | { kind: 'mint'; appId: string; capability: AppCapability; nonce: number; expiresAt: number }
  | { kind: 'verify-ok'; appId: string; capability: AppCapability; nonce: number }
  | { kind: 'verify-fail'; appId: string; capability: AppCapability; reason: string }
  | { kind: 'grant-missing'; appId: string; capability: AppCapability };

export interface BrokerOptions {
  /** Token TTL in ms. */
  tokenTtlMs?: number;
  /** Now() supplier. */
  now?: () => number;
  /** Random source for nonces. */
  nonceSource?: () => number;
}

export class CapabilityBroker {
  private replay = new MemoryReplayCache();
  private nonceSeq = 1;
  private now: () => number;
  private nonce: () => number;
  private ttl: number;

  constructor(
    private readonly grants: GrantLookup,
    private readonly verifier: TokenVerifier,
    private readonly audit: AuditSink,
    opts: BrokerOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.nonce = opts.nonceSource ?? (() => this.nonceSeq++);
    this.ttl = opts.tokenTtlMs ?? 60_000;
  }

  /** Issue a token for a granted (appId, capability). Returns null if not granted. */
  issue(appId: string, capability: AppCapability): CapabilityToken | null {
    const t = this.now();
    if (!this.grants.isGranted(appId, capability, t)) {
      this.audit.record({ kind: 'grant-missing', appId, capability });
      return null;
    }
    const token = mintToken({ appId, capability, ttlMs: this.ttl, nonce: this.nonce() }, t, this.verifier);
    this.audit.record({ kind: 'mint', appId, capability, nonce: token.nonce, expiresAt: token.expiresAt });
    return token;
  }

  /** Validate a token presented by an app on an IPC call. */
  validate(token: CapabilityToken, expect: { appId: string; capability: AppCapability }): boolean {
    const r = verifyToken(token, expect, this.now(), this.verifier, this.replay);
    if (r.ok) {
      this.audit.record({ kind: 'verify-ok', appId: expect.appId, capability: expect.capability, nonce: token.nonce });
      return true;
    }
    this.audit.record({ kind: 'verify-fail', appId: expect.appId, capability: expect.capability, reason: r.reason });
    return false;
  }
}
