// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * On-demand placeholder-file model (DEX_FEATURE_BACKLOG 09, research-verified).
 *
 * Steal from the Windows Cloud Files API (CfAPI, 3-vote verified): a sync engine
 * represents a cloud file as a PLACEHOLDER that consumes only ~1 KB (a filesystem
 * header) yet presents to apps + the shell as a normal file, and auto-HYDRATES
 * into the full file on access — then can DEHYDRATE back to reclaim space. This is
 * the pure state machine for that: dehydrated ⇄ hydrated transitions, on-access
 * hydration, pin/unpin (always-keep vs free-up-space), and storage accounting that
 * separates on-disk bytes from logical size.
 *
 * Pure: no filesystem. The host sync driver does the real I/O; this owns the rules.
 */

/** ~1 KB header for a dehydrated placeholder (CfAPI figure). */
export const PLACEHOLDER_HEADER_BYTES = 1024;

export type HydrationState = 'dehydrated' | 'hydrated';

/** Pin state: pinned = always keep local; unpinned = free-up-space eligible. */
export type PinState = 'pinned' | 'unpinned' | 'online-only';

export interface PlaceholderFile {
  path: string;
  /** Full logical size of the file when hydrated. */
  logicalSize: number;
  state: HydrationState;
  pin: PinState;
}

/** Bytes actually consumed on disk: full size when hydrated, header when not. */
export function onDiskBytes(f: PlaceholderFile): number {
  return f.state === 'hydrated' ? f.logicalSize : PLACEHOLDER_HEADER_BYTES;
}

/** Storage saved by keeping a file dehydrated vs fully local. */
export function savedBytes(f: PlaceholderFile): number {
  return f.state === 'hydrated' ? 0 : Math.max(0, f.logicalSize - PLACEHOLDER_HEADER_BYTES);
}

/** Hydrate a placeholder into a full local file (idempotent). */
export function hydrate(f: PlaceholderFile): PlaceholderFile {
  return f.state === 'hydrated' ? f : { ...f, state: 'hydrated' };
}

/**
 * Dehydrate a hydrated file back to a placeholder to reclaim space. A `pinned`
 * file refuses to dehydrate (always-keep-local). `online-only` forces it.
 */
export function dehydrate(f: PlaceholderFile): PlaceholderFile {
  if (f.pin === 'pinned') return f; // always keep local
  return f.state === 'dehydrated' ? f : { ...f, state: 'dehydrated' };
}

/**
 * On-access hydration: opening a dehydrated file transparently hydrates it (the
 * core CfAPI behaviour — apps treat it as a normal file). Online-only files still
 * hydrate on explicit access; they are just dehydration-eager afterwards.
 */
export function onAccess(f: PlaceholderFile): PlaceholderFile {
  return hydrate(f);
}

export function setPin(f: PlaceholderFile, pin: PinState): PlaceholderFile {
  const next = { ...f, pin };
  // Pinning hydrates (always-keep-local); online-only dehydrates eagerly.
  if (pin === 'pinned') return hydrate(next);
  if (pin === 'online-only') return dehydrate({ ...next, pin: 'online-only' });
  return next;
}

export interface FolderStorage {
  totalLogical: number;
  totalOnDisk: number;
  totalSaved: number;
  hydratedCount: number;
  dehydratedCount: number;
}

/** Aggregate on-disk vs logical usage across a set of placeholder files. */
export function folderStorage(files: ReadonlyArray<PlaceholderFile>): FolderStorage {
  return files.reduce<FolderStorage>(
    (acc, f) => {
      acc.totalLogical += f.logicalSize;
      acc.totalOnDisk += onDiskBytes(f);
      acc.totalSaved += savedBytes(f);
      if (f.state === 'hydrated') acc.hydratedCount++; else acc.dehydratedCount++;
      return acc;
    },
    { totalLogical: 0, totalOnDisk: 0, totalSaved: 0, hydratedCount: 0, dehydratedCount: 0 },
  );
}

/**
 * Free-up-space sweep: dehydrate enough UNPINNED hydrated files (largest first)
 * to reclaim at least `targetBytes`, returning the updated set. Pinned files are
 * never touched (the CfAPI always-keep guarantee).
 */
export function reclaimSpace(files: ReadonlyArray<PlaceholderFile>, targetBytes: number): PlaceholderFile[] {
  const result = files.map((f) => ({ ...f }));
  const candidates = result
    .filter((f) => f.state === 'hydrated' && f.pin !== 'pinned')
    .sort((a, b) => b.logicalSize - a.logicalSize);
  let reclaimed = 0;
  for (const f of candidates) {
    if (reclaimed >= targetBytes) break;
    const before = onDiskBytes(f);
    f.state = 'dehydrated';
    reclaimed += before - onDiskBytes(f);
  }
  return result;
}
