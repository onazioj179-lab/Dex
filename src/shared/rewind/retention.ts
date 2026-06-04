// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rewind retention policy (RWD-029). Rewind stores activity in date-sharded
 * files ("YYYY-MM-DD"); this computes which shards have aged past the retention
 * window so the engine can auto-delete them. Pure (no IO) and clock-injectable,
 * so the deletion side-effect stays in the main process and the *policy* is
 * testable here.
 */

const SHARD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a "YYYY-MM-DD" shard id to a local-midnight epoch ms, or null. */
export function shardToTime(shard: string): number | null {
  if (!SHARD_RE.test(shard)) return null;
  const [y, m, d] = shard.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Guard against rollovers like 2026-02-30.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date.getTime();
}

/** Age of a shard in whole days relative to `now`. */
export function shardAgeDays(shard: string, now: number = Date.now()): number | null {
  const t = shardToTime(shard);
  if (t === null) return null;
  return Math.floor((now - t) / 86_400_000);
}

/**
 * Given existing shard ids and a retention window, return the shards to delete
 * (older than `retentionDays`). `retentionDays <= 0` means "keep forever" → [].
 * Invalid shard ids are ignored. Result is sorted oldest-first.
 */
export function expiredShards(
  shards: readonly string[],
  retentionDays: number,
  now: number = Date.now(),
): string[] {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return [];
  const out: string[] = [];
  for (const s of shards) {
    const age = shardAgeDays(s, now);
    if (age !== null && age > retentionDays) out.push(s);
  }
  return out.sort();
}
