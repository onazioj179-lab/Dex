// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// permissionsPolicy
//
// Pure policy helpers for the consolidated permissions surface. Implements the
// "reduced permission prompts" feedback: instead of one prompt per capability
// per session, we group related capabilities into a single batched grant with
// an explicit expiry. The renderer / main process IO layer consults these
// helpers to decide whether to prompt at all, prompt once for a group, or
// silently allow on a still-valid grant.
//
// No fs, no Electron, no IO. Pure data-in / data-out so we can unit-test the
// matrix exhaustively.
// =============================================================================

export type PermissionCapability =
  | 'screen-record'
  | 'camera'
  | 'microphone'
  | 'location'
  | 'clipboard-read'
  | 'clipboard-cloud-sync'
  | 'files-read'
  | 'files-write'
  | 'network-request'
  | 'notifications'
  | 'biometric'
  | 'system-events';

/**
 * Capability groups that should be granted together, mirroring the macOS
 * complaint that recording / camera / mic are prompted separately during a
 * single recording flow. One prompt covers the group.
 */
export const PERMISSION_GROUPS: Record<string, PermissionCapability[]> = {
  capture: ['screen-record', 'camera', 'microphone'],
  files: ['files-read', 'files-write'],
  clipboard: ['clipboard-read', 'clipboard-cloud-sync'],
  presence: ['location', 'notifications'],
};

export type PermissionDecision = 'allow' | 'deny' | 'prompt';

export interface PermissionGrant {
  capability: PermissionCapability;
  /** Origin requesting the capability (app id, plugin id, etc). */
  origin: string;
  decision: 'allow' | 'deny';
  /** Epoch ms when this grant was created. */
  grantedAt: number;
  /** Epoch ms when this grant expires (0 = never). */
  expiresAt: number;
  /** True when the grant was given via a group prompt. */
  fromGroup: boolean;
  /** Human-readable reason captured at grant time. */
  reason?: string;
}

export interface PermissionRequest {
  capability: PermissionCapability;
  origin: string;
  /** Required: explanation displayed to the user when prompting. */
  reason: string;
  /** Optional explicit expiry. Defaults applied per capability if omitted. */
  ttlMs?: number;
}

/**
 * Default time-to-live per capability. Sensitive capabilities expire fast so
 * the user re-confirms; low-risk ones persist for a working day.
 */
export const DEFAULT_TTL_MS: Record<PermissionCapability, number> = {
  'screen-record': 30 * 60 * 1000,
  camera: 30 * 60 * 1000,
  microphone: 30 * 60 * 1000,
  location: 60 * 60 * 1000,
  'clipboard-read': 8 * 60 * 60 * 1000,
  'clipboard-cloud-sync': 7 * 24 * 60 * 60 * 1000,
  'files-read': 8 * 60 * 60 * 1000,
  'files-write': 8 * 60 * 60 * 1000,
  'network-request': 24 * 60 * 60 * 1000,
  notifications: 30 * 24 * 60 * 60 * 1000,
  biometric: 5 * 60 * 1000,
  'system-events': 60 * 60 * 1000,
};

/**
 * Look up an existing grant for (capability, origin). Returns the matching
 * grant only if it is still valid (not expired). Otherwise returns null.
 */
export function findActiveGrant(
  grants: PermissionGrant[],
  capability: PermissionCapability,
  origin: string,
  now: number = Date.now()
): PermissionGrant | null {
  for (const g of grants) {
    if (g.capability !== capability) continue;
    if (g.origin !== origin) continue;
    if (g.expiresAt !== 0 && g.expiresAt <= now) continue;
    return g;
  }
  return null;
}

/**
 * Decide what to do for a single capability request, given the current grant
 * store. Returns one of:
 *   - 'allow': there is a still-valid allow grant; do not prompt.
 *   - 'deny':  there is a still-valid deny grant; do not prompt, fail fast.
 *   - 'prompt': no valid grant; the caller must prompt the user.
 */
export function decidePermission(
  grants: PermissionGrant[],
  request: PermissionRequest,
  now: number = Date.now()
): PermissionDecision {
  const g = findActiveGrant(grants, request.capability, request.origin, now);
  if (!g) return 'prompt';
  return g.decision;
}

/**
 * Given a batch of requests from one origin, collapse them into the smallest
 * set of prompt-batches keyed by group. Capabilities with an active allow are
 * dropped. Capabilities with an active deny short-circuit the batch.
 *
 * Returns:
 *   - allowed: capabilities that already had a valid allow grant.
 *   - denied:  capabilities that already had a valid deny grant.
 *   - batches: groups of capabilities that need a single prompt each. The
 *              key 'individual' holds capabilities that don't belong to any
 *              defined group.
 */
export interface BatchedDecision {
  allowed: PermissionCapability[];
  denied: PermissionCapability[];
  batches: Record<string, PermissionCapability[]>;
}

export function batchPrompts(
  grants: PermissionGrant[],
  requests: PermissionRequest[],
  now: number = Date.now()
): BatchedDecision {
  const allowed: PermissionCapability[] = [];
  const denied: PermissionCapability[] = [];
  const needsPrompt: PermissionCapability[] = [];

  for (const r of requests) {
    const decision = decidePermission(grants, r, now);
    if (decision === 'allow') allowed.push(r.capability);
    else if (decision === 'deny') denied.push(r.capability);
    else needsPrompt.push(r.capability);
  }

  const batches: Record<string, PermissionCapability[]> = {};
  const individual: PermissionCapability[] = [];

  for (const cap of needsPrompt) {
    let placed = false;
    for (const [groupName, members] of Object.entries(PERMISSION_GROUPS)) {
      if (members.includes(cap)) {
        if (!batches[groupName]) batches[groupName] = [];
        if (!batches[groupName].includes(cap)) batches[groupName].push(cap);
        placed = true;
        break;
      }
    }
    if (!placed) individual.push(cap);
  }
  if (individual.length > 0) batches.individual = individual;

  return { allowed, denied, batches };
}

/**
 * Build a fresh grant record from a request and a user choice. Resolves the
 * TTL from the request override or the per-capability default.
 */
export function buildGrant(
  request: PermissionRequest,
  decision: 'allow' | 'deny',
  now: number = Date.now(),
  fromGroup: boolean = false
): PermissionGrant {
  const ttl = request.ttlMs ?? DEFAULT_TTL_MS[request.capability];
  return {
    capability: request.capability,
    origin: request.origin,
    decision,
    grantedAt: now,
    expiresAt: ttl > 0 ? now + ttl : 0,
    fromGroup,
    reason: request.reason,
  };
}

/**
 * Drop expired grants. Returns a new array.
 */
export function pruneExpired(
  grants: PermissionGrant[],
  now: number = Date.now()
): PermissionGrant[] {
  return grants.filter((g) => g.expiresAt === 0 || g.expiresAt > now);
}

/**
 * Validate a string is a known capability. Used at IPC boundary.
 */
export function isPermissionCapability(value: unknown): value is PermissionCapability {
  return (
    value === 'screen-record' ||
    value === 'camera' ||
    value === 'microphone' ||
    value === 'location' ||
    value === 'clipboard-read' ||
    value === 'clipboard-cloud-sync' ||
    value === 'files-read' ||
    value === 'files-write' ||
    value === 'network-request' ||
    value === 'notifications' ||
    value === 'biometric' ||
    value === 'system-events'
  );
}
