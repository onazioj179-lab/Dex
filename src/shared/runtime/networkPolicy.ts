// =============================================================================
// DEX Platform — Security: per-app network capability gating
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-app network capability gating (DEX_FEATURE_BACKLOG 03 · P1).
 *
 * Models the Windows AppContainer network-isolation capabilities — `internetClient`,
 * `internetClientServer`, `privateNetworkClientServer` — as DEX policy derived from
 * an app's declared `AppCapability[]` (Google Project Zero / MS Learn). The OS layer
 * (WFP filters / AppContainer SIDs on Windows, nftables/`--unshare-net` on Linux)
 * does the kernel enforcement; THIS module is the host-agnostic policy that decides,
 * per request, whether a destination is permitted — fail-closed by default, exactly
 * as AppContainer is *capability-gated* (a blanket default-deny was REFUTED in the
 * research: it's gated by network class + loopback, not blanket-blocked).
 *
 * Crucially, loopback (localhost) is DENIED by default even for networked apps —
 * AppContainer blocks cross-package loopback, and DEX routes inner-app comms through
 * the capability broker (see brokeredIpc), never raw localhost sockets.
 *
 * Pure logic, fully unit-testable; no sockets, no IO.
 */

import type { AppCapability } from './appContainer';

/** Windows AppContainer network-isolation capability classes. */
export type NetworkCapability =
  | 'internetClient'              // outbound to the internet
  | 'internetClientServer'       // outbound + inbound from the internet
  | 'privateNetworkClientServer'; // outbound + inbound on the local/private network

/** A concrete network request to evaluate. */
export type NetworkRequestKind =
  | 'internet-outbound'
  | 'internet-inbound'
  | 'private-outbound'
  | 'private-inbound'
  | 'loopback';

export interface NetworkPolicy {
  /** The granted network capability classes. */
  caps: ReadonlySet<NetworkCapability>;
  /** Whether raw loopback (localhost) sockets are permitted. Default false. */
  allowLoopback: boolean;
}

export interface DeriveOptions {
  /**
   * Apps that legitimately accept inbound internet connections (servers) must
   * declare it. DEX has no dedicated server capability today, so it is opt-in via
   * this flag (set by the manifest's `network.server` extension when present).
   */
  inboundInternet?: boolean;
  /** Permit raw loopback (only for trusted system apps; never the default). */
  allowLoopback?: boolean;
}

/**
 * Derive the network policy from an app's declared capabilities.
 *
 *   'network'        -> internetClient (+ internetClientServer when inbound opt-in)
 *   'network.local'  -> privateNetworkClientServer
 *   (neither)        -> no network at all (fully unshared)
 */
export function deriveNetworkPolicy(
  caps: ReadonlyArray<AppCapability>,
  opts: DeriveOptions = {},
): NetworkPolicy {
  const set = new Set<NetworkCapability>();
  if (caps.includes('network')) {
    set.add(opts.inboundInternet ? 'internetClientServer' : 'internetClient');
  }
  if (caps.includes('network.local')) {
    set.add('privateNetworkClientServer');
  }
  return { caps: set, allowLoopback: opts.allowLoopback === true };
}

export interface NetworkDecision {
  allow: boolean;
  reason: string;
}

/** Evaluate one network request against the policy. Fail-closed (default deny). */
export function checkNetworkRequest(policy: NetworkPolicy, kind: NetworkRequestKind): NetworkDecision {
  switch (kind) {
    case 'loopback':
      return policy.allowLoopback
        ? { allow: true, reason: 'loopback permitted' }
        : { allow: false, reason: 'loopback blocked (use the capability broker, not localhost sockets)' };
    case 'internet-outbound':
      return policy.caps.has('internetClient') || policy.caps.has('internetClientServer')
        ? { allow: true, reason: 'internetClient' }
        : { allow: false, reason: 'no internetClient capability' };
    case 'internet-inbound':
      return policy.caps.has('internetClientServer')
        ? { allow: true, reason: 'internetClientServer' }
        : { allow: false, reason: 'no internetClientServer capability' };
    case 'private-outbound':
    case 'private-inbound':
      return policy.caps.has('privateNetworkClientServer')
        ? { allow: true, reason: 'privateNetworkClientServer' }
        : { allow: false, reason: 'no privateNetworkClientServer capability' };
    default:
      return { allow: false, reason: 'unknown request kind' };
  }
}

/**
 * Classify a destination (host + whether the connection is inbound) into a request
 * kind, so a host net-guard can call `checkNetworkRequest` with a real URL. Pure
 * string analysis — the caller resolves DNS/routing; this only categorises.
 */
export function classifyDestination(host: string, inbound = false): NetworkRequestKind {
  const h = (host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.startsWith('127.')) return 'loopback';
  if (isPrivateHost(h)) return inbound ? 'private-inbound' : 'private-outbound';
  return inbound ? 'internet-inbound' : 'internet-outbound';
}

/** RFC1918 / link-local / unique-local private address detection. */
function isPrivateHost(h: string): boolean {
  if (h === '0.0.0.0') return true;
  if (h.endsWith('.local')) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;       // IPv4 link-local
  if (/^fe80:/i.test(h)) return true;            // IPv6 link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true; // IPv6 unique-local (fc00::/7)
  return false;
}
