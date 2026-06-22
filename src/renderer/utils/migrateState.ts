// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Versioned persisted-state migration.
 *
 * When an app changes the shape of what it persists, old saved blobs would crash
 * or silently corrupt the new code. This runs ordered step migrations from a
 * blob's stored `__v` up to the current version, so users keep their data across
 * upgrades. Anything that throws (missing/garbage migration, corrupt blob) falls
 * back to the supplied default rather than breaking the app.
 *
 * A migration `migrations[n]` upgrades a value FROM version `n` TO version `n+1`.
 */

import { getJSON, setJSON } from './safeStorage';

export interface Versioned {
  /** Schema version stamped onto the persisted blob. Absent = version 0. */
  __v?: number;
}

export type Migration = (prev: any) => any;

/**
 * Migrate a raw parsed value to `currentVersion`. `migrations` is keyed by the
 * FROM-version (so key `0` upgrades v0->v1). Returns the migrated value stamped
 * with `__v = currentVersion`, or `fallback` if migration throws.
 */
export function migrateState<T extends Versioned>(
  raw: unknown,
  currentVersion: number,
  migrations: Record<number, Migration>,
  fallback: T,
): T {
  if (raw == null || typeof raw !== 'object') return { ...fallback, __v: currentVersion };
  try {
    let value: any = raw;
    let version = typeof value.__v === 'number' ? value.__v : 0;
    // Future blob (downgrade) — trust it but don't run unknown forward steps.
    if (version > currentVersion) return value as T;
    while (version < currentVersion) {
      const step = migrations[version];
      if (typeof step !== 'function') break; // no path forward — keep what we have
      value = step(value);
      version += 1;
    }
    return { ...value, __v: currentVersion } as T;
  } catch {
    return { ...fallback, __v: currentVersion };
  }
}

/**
 * Convenience: read a versioned blob from localStorage, migrate it, and (when it
 * was upgraded) write the migrated form back so the next load is cheap. Always
 * returns a value of the current shape.
 */
export function loadMigrated<T extends Versioned>(
  key: string,
  currentVersion: number,
  migrations: Record<number, Migration>,
  fallback: T,
): T {
  const raw = getJSON<unknown>(key, null as unknown);
  const migrated = migrateState<T>(raw, currentVersion, migrations, fallback);
  const wasVersion = raw && typeof raw === 'object' && typeof (raw as Versioned).__v === 'number'
    ? (raw as Versioned).__v
    : 0;
  if (wasVersion !== currentVersion) setJSON(key, migrated);
  return migrated;
}
