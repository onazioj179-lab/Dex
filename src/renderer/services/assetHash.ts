// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Asset content hashing + de-duplication (CRT-016, SVC-006). The universal
 * AssetLibrary needs to recognise identical content imported twice so projects
 * stop ballooning with duplicate media. This is a fast, deterministic, non-
 * cryptographic content hash (FNV-1a, 32-bit) plus pure dedup helpers over any
 * `{ id, hash }` records. Cheap enough to run on import; collision risk is
 * acceptable for dedup (callers may verify on hit).
 *
 * Pure: no DOM, no IO.
 */

/** FNV-1a 32-bit over a UTF-16 string, returned as 8-char lowercase hex. */
export function hashString(input: string): string {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    // 32-bit FNV prime multiply via shifts to stay in int range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** FNV-1a 32-bit over raw bytes (e.g. a decoded file buffer). */
export function hashBytes(bytes: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i] & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface HashedRecord {
  id: string;
  hash: string;
}

/**
 * Given existing records and a candidate hash, return the id of the first
 * existing record with the same hash, or null when the content is new.
 */
export function findDuplicate(existing: readonly HashedRecord[], candidateHash: string): string | null {
  for (const r of existing) if (r.hash === candidateHash) return r.id;
  return null;
}

export interface DedupResult<T extends HashedRecord> {
  /** One record kept per distinct hash (first-seen wins). */
  unique: T[];
  /** Map of dropped duplicate id -> the id it duplicates. */
  duplicates: Record<string, string>;
}

/** Collapse a list of hashed records to unique content, first occurrence wins. */
export function dedupe<T extends HashedRecord>(records: readonly T[]): DedupResult<T> {
  const seen = new Map<string, string>(); // hash -> kept id
  const unique: T[] = [];
  const duplicates: Record<string, string> = {};
  for (const r of records) {
    const keptId = seen.get(r.hash);
    if (keptId) {
      duplicates[r.id] = keptId;
    } else {
      seen.set(r.hash, r.id);
      unique.push(r);
    }
  }
  return { unique, duplicates };
}
