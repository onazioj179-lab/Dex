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
