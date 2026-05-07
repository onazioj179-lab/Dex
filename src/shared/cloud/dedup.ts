// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Content-addressed storage helpers.
 *
 * The cloud sync layer dedups by SHA-256. This module exposes pure
 * helpers for chunking, content-id construction, and a tiny in-memory
 * dedup index used in tests + the renderer's storage breakdown.
 */

// DEX v3.8.9 - dedup

export interface DedupIndex {
  /** content-id -> object metadata. */
  entries: Map<string, { size: number; refCount: number }>;
}

export function createDedupIndex(): DedupIndex {
  return { entries: new Map() };
}

/** Add a reference to a content-id. Returns true if this is the first ref. */
export function addRef(index: DedupIndex, contentId: string, size: number): boolean {
  const existing = index.entries.get(contentId);
  if (existing) {
    existing.refCount += 1;
    return false;
  }
  index.entries.set(contentId, { size, refCount: 1 });
  return true;
}

/** Drop a reference. Returns true if the content-id was fully removed. */
export function dropRef(index: DedupIndex, contentId: string): boolean {
  const existing = index.entries.get(contentId);
  if (!existing) return false;
  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    index.entries.delete(contentId);
    return true;
  }
  return false;
}

/** Total bytes physically stored (one entry per unique content-id). */
export function physicalBytes(index: DedupIndex): number {
  let n = 0;
  for (const v of index.entries.values()) n += v.size;
  return n;
}

/** Total bytes if dedup were not in play (counts every reference). */
export function logicalBytes(index: DedupIndex): number {
  let n = 0;
  for (const v of index.entries.values()) n += v.size * v.refCount;
  return n;
}

/** How much storage dedup is saving, as a fraction. */
export function dedupRatio(index: DedupIndex): number {
  const log = logicalBytes(index);
  if (log === 0) return 0;
  const phys = physicalBytes(index);
  return 1 - phys / log;
}

/** Pure chunker. Returns sequential byte ranges of `chunkSize` (last is short). */
export function chunkRanges(totalBytes: number, chunkSize: number): Array<{ start: number; end: number }> {
  if (totalBytes <= 0 || chunkSize <= 0) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (let s = 0; s < totalBytes; s += chunkSize) {
    out.push({ start: s, end: Math.min(s + chunkSize, totalBytes) });
  }
  return out;
}
