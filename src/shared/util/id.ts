// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Canonical unique-id generator -- the ONE source of truth for the ephemeral
// `${prefix}-${timestamp}-${random}` ids the renderer scatters everywhere
// (React keys, layer/clip/job/track ids, session + telemetry ids). It replaces
// ~15 byte-identical inline copies that each app, store, and service had grown
// its own slightly-drifting version of (some `substr`, some `slice`, varying
// lengths) -- consolidation audit, 2026-06-16.
//
// Contract: the ONLY guarantee is uniqueness-in-practice; the exact string shape
// is never parsed, persisted-for-comparison, or relied upon. `generateId()`
// returns `timestamp-random`; `generateId('clip')` returns `clip-timestamp-random`.
//
// NOT for ids that must be unpredictable or cryptographically unique -- those
// intentionally use `crypto.randomUUID()` / `crypto.randomBytes(...)` (see
// main/store/DataStore, main/plugins/PluginEngine, main/core/DataImportManager)
// and must stay on crypto, not this.

export function generateId(prefix?: string): string {
  const core = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return prefix ? `${prefix}-${core}` : core;
}
