// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const PREFIX = 'dex:';

export async function persistGet<T>(key: string): Promise<T | undefined> {
  try { return await idbGet(PREFIX + key); } catch { return undefined; }
}
export async function persistSet<T>(key: string, value: T): Promise<void> {
  try { await idbSet(PREFIX + key, value); } catch (e) { console.warn('[persist]', key, e); }
}
export async function persistDel(key: string): Promise<void> {
  try { await idbDel(PREFIX + key); } catch (e) { console.warn('[persist]', key, e); }
}
export async function persistKeys(): Promise<string[]> {
  try { return (await idbKeys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length)); } catch { return []; }
}

// Migration helper: copy a localStorage key's JSON into IDB once, then keep both in sync.
export async function migrateLocalStorageKeyOnce(key: string): Promise<void> {
  const flagKey = `migrated:${key}`;
  if (await persistGet(flagKey)) return;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { await persistSet(key, JSON.parse(raw)); }
      catch { await persistSet(key, raw); }
    }
    await persistSet(flagKey, true);
  } catch (e) { console.warn('[persist] migrate', key, e); }
}
