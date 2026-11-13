// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Saved creative assets (Part 5 §15 shared assets library, backlog #26).
 * Persistent, unlike the in-memory catalog in AssetLibrary.ts.
 *
 * Any creative app's "Send To" menu can save the current asset here; Creative
 * Hub lists them and sends one to another app later. Assets live in IndexedDB
 * on this device: an index of metadata plus one record per asset's data.
 * Writes report failure (a full disk is not hidden) and the library is capped
 * so it cannot silently eat the browser quota.
 */
import { get, set, del } from 'idb-keyval';
import type { SharedAsset, AssetKind, SourceAppId } from './CreativeSuiteBridge';

export interface LibraryEntry {
  id: string;
  name: string;
  kind: AssetKind;
  sourceApp: SourceAppId;
  mimeType?: string;
  bytes: number;
  savedAt: number;
}

export const LIBRARY_CHANGED = 'dex-asset-library-changed';
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 300 * 1024 * 1024;
const INDEX_KEY = 'dex:asset-lib:index';
const dataKey = (id: string) => `dex:asset-lib:data:${id}`;

/** UTF-16 string size estimate (what IndexedDB actually stores for a string). */
export const sizeOf = (s: string) => s.length * 2;

export async function listAssets(): Promise<LibraryEntry[]> {
  try {
    const idx = await get<LibraryEntry[]>(INDEX_KEY);
    return Array.isArray(idx) ? [...idx].sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch { return []; }
}

export async function libraryBytes(): Promise<number> {
  return (await listAssets()).reduce((a, e) => a + e.bytes, 0);
}

export type SaveResult = { ok: true; entry: LibraryEntry } | { ok: false; error: string };

export async function saveAsset(asset: SharedAsset): Promise<SaveResult> {
  if (!asset.data) return { ok: false, error: 'There is nothing to save yet.' };
  const bytes = sizeOf(asset.data);
  if (bytes > MAX_ASSET_BYTES) return { ok: false, error: `It is too large for the library (${Math.round(bytes / 1048576)} MB; the limit is ${MAX_ASSET_BYTES / 1048576} MB).` };
  const index = await listAssets();
  const used = index.reduce((a, e) => a + e.bytes, 0);
  if (used + bytes > MAX_LIBRARY_BYTES) return { ok: false, error: 'The library is full. Delete some assets in Creative Hub first.' };
  const entry: LibraryEntry = {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: asset.name || 'Untitled', kind: asset.kind, sourceApp: asset.sourceApp,
    mimeType: asset.mimeType, bytes, savedAt: Date.now(),
  };
  try {
    await set(dataKey(entry.id), { data: asset.data, metadata: asset.metadata ?? null });
    await set(INDEX_KEY, [entry, ...index]);
  } catch (e) {
    try { await del(dataKey(entry.id)); } catch { /* best effort */ }
    return { ok: false, error: e instanceof Error ? e.message : 'The asset could not be stored.' };
  }
  window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
  return { ok: true, entry };
}

/** The full asset, ready for CreativeSuiteBridge.sendToApp; null when its data is gone. */
export async function loadAsset(id: string): Promise<SharedAsset | null> {
  const entry = (await listAssets()).find(e => e.id === id);
  if (!entry) return null;
  try {
    const rec = await get<{ data: string; metadata: Record<string, unknown> | null }>(dataKey(id));
    if (!rec?.data) return null;
    return { id: entry.id, kind: entry.kind, name: entry.name, sourceApp: entry.sourceApp, data: rec.data, mimeType: entry.mimeType, metadata: rec.metadata ?? undefined, createdAt: entry.savedAt };
  } catch { return null; }
}

export async function deleteAsset(id: string): Promise<boolean> {
  try {
    const index = await listAssets();
    await set(INDEX_KEY, index.filter(e => e.id !== id));
    await del(dataKey(id));
    window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
    return true;
  } catch { return false; }
}
