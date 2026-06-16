// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Permissions — explicit user grants for sensitive capabilities.
 *
 * No capability is ever assumed. Modules that need shell, screen, file write,
 * mic, etc. must call `require(capability)` and handle the rejection. UI
 * surfaces (settings, prompt) call `grant`/`revoke`.
 *
 * Persisted via the cache layer (plain — these are user choices, not secrets).
 */

import * as cache from './cache';
import { SCHEMA_VERSION, type UkiPermissionRecord } from './schemas';

export type Capability = UkiPermissionRecord['capability'];

const STORE_KEY = 'uki:permissions';

/** Capabilities that are always denied for safety in renderer scope. */
const HARD_DENY: ReadonlySet<Capability> = new Set<Capability>([
  // none today; reserved for future shell expansion gates
]);

export async function listGrants(): Promise<UkiPermissionRecord[]> {
  const raw = (await cache.getAsync<UkiPermissionRecord[]>(STORE_KEY)) ?? [];
  const now = Date.now();
  // Lazy-prune expired session grants on read.
  const live = raw.filter((g) => !g.expiresTs || g.expiresTs > now);
  if (live.length !== raw.length) await cache.setAsync(STORE_KEY, live);
  return live;
}

export async function isGranted(capability: Capability): Promise<boolean> {
  if (HARD_DENY.has(capability)) return false;
  const grants = await listGrants();
  return grants.some((g) => g.capability === capability);
}

export async function grant(
  capability: Capability,
  scope: UkiPermissionRecord['scope'] = 'session'
): Promise<UkiPermissionRecord> {
  if (HARD_DENY.has(capability)) {
    throw new Error(`Capability ${capability} is hard-denied in this build.`);
  }
  const grants = await listGrants();
  const filtered = grants.filter((g) => g.capability !== capability);
  const record: UkiPermissionRecord = {
    schemaVersion: SCHEMA_VERSION,
    capability,
    scope,
    grantedTs: Date.now(),
    expiresTs: scope === 'session' ? Date.now() + 4 * 60 * 60 * 1000 : undefined,
  };
  await cache.setAsync(STORE_KEY, filtered.concat(record));
  return record;
}

export async function revoke(capability: Capability): Promise<void> {
  const grants = await listGrants();
  await cache.setAsync(STORE_KEY, grants.filter((g) => g.capability !== capability));
}

/** Throws unless the capability is granted. */
export async function require(capability: Capability): Promise<void> {
  const ok = await isGranted(capability);
  if (!ok) throw new Error(`UKI capability not granted: ${capability}`);
}

// ---------------------------------------------------------------------------
// Transparency — "the user should always know what UKI can and cannot access,
// and why." A single source of truth for the full capability set plus a plain
// description and rationale for each, joined with the live grant state.
// ---------------------------------------------------------------------------

/** Every capability UKI can ever hold, in display order. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'screen-read', 'file-read', 'file-write', 'shell',
  'network', 'clipboard', 'microphone', 'camera', 'notifications',
];

const CAPABILITY_LABEL: Record<Capability, string> = {
  'screen-read': 'Read screen',
  'file-read': 'Read files',
  'file-write': 'Write files',
  'shell': 'Run shell commands',
  'network': 'Access the network',
  'clipboard': 'Read the clipboard',
  'microphone': 'Use the microphone',
  'camera': 'Use the camera',
  'notifications': 'Post notifications',
};

const CAPABILITY_RATIONALE: Record<Capability, string> = {
  'screen-read': 'Understand the active window and layout to answer about what is on screen.',
  'file-read': 'Read a file you point it at to summarize, search, or explain it.',
  'file-write': 'Save edits, create files, or apply changes you ask for.',
  'shell': 'Run a command you requested (build, git, scripts).',
  'network': 'Fetch supporting information from approved sources.',
  'clipboard': 'Use copied text as context when you ask it to.',
  'microphone': 'Hear voice commands when you start dictation.',
  'camera': 'Capture an image only when you explicitly request it.',
  'notifications': 'Tell you when a long task finishes.',
};

export type CapabilityStatus = 'granted' | 'denied' | 'hard-denied';

export interface CapabilityInfo {
  capability: Capability;
  status: CapabilityStatus;
  /** Short human label, e.g. "Read files". */
  label: string;
  /** Why UKI would request this capability. */
  rationale: string;
  scope?: UkiPermissionRecord['scope'];
  grantedTs?: number;
  /** Set for session grants; the access lapses at this time. */
  expiresTs?: number;
}

/**
 * The full transparency view: every capability with its live status (granted /
 * denied / hard-denied), scope/expiry, and a plain-language label + rationale.
 * Reuses {@link listGrants} so expired session grants are pruned consistently.
 */
export async function describeCapabilities(): Promise<CapabilityInfo[]> {
  const grants = await listGrants();
  const byCap = new Map(grants.map((g) => [g.capability, g]));
  return ALL_CAPABILITIES.map((capability) => {
    const g = byCap.get(capability);
    const status: CapabilityStatus = HARD_DENY.has(capability)
      ? 'hard-denied'
      : g ? 'granted' : 'denied';
    return {
      capability,
      status,
      label: CAPABILITY_LABEL[capability],
      rationale: CAPABILITY_RATIONALE[capability],
      scope: g?.scope,
      grantedTs: g?.grantedTs,
      expiresTs: g?.expiresTs,
    };
  });
}
