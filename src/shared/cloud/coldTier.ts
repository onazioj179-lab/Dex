// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cold-tier policy. After `idleDays`, large files demote to cold storage.
 * Restoring requires a thaw step; the renderer surfaces the ETA.
 */

// DEX v3.8.9 - cold tier

export interface ColdTierPolicy {
  idleDays: number;       // demote after this many days untouched
  minBytes: number;       // only demote files at least this big
}

export function defaultColdPolicy(): ColdTierPolicy {
  return { idleDays: 90, minBytes: 50 * 1024 * 1024 };
}

export interface FileMeta {
  fileId: string;
  bytes: number;
  lastAccessedAt: number;
  tier: 'hot' | 'cold';
}

/** Returns files that should demote per the policy. */
export function pickForDemotion(files: FileMeta[], policy: ColdTierPolicy, now: number = Date.now()): FileMeta[] {
  const idleMs = policy.idleDays * 24 * 60 * 60 * 1000;
  return files.filter((f) => f.tier === 'hot' && f.bytes >= policy.minBytes && now - f.lastAccessedAt >= idleMs);
}

/** Returns files that should promote (recently accessed cold files). */
export function pickForPromotion(files: FileMeta[], promoteWithinMs: number = 24 * 60 * 60 * 1000, now: number = Date.now()): FileMeta[] {
  return files.filter((f) => f.tier === 'cold' && now - f.lastAccessedAt <= promoteWithinMs);
}

/** ETA in seconds for a thaw of a file, given a fixed thaw rate. */
export function thawEtaSeconds(bytes: number, rateBytesPerSec: number = 50 * 1024 * 1024): number {
  if (rateBytesPerSec <= 0) return Infinity;
  return Math.ceil(bytes / rateBytesPerSec);
}
