// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * One safe localStorage layer for ordinary (non-Zustand) app code.
 *
 * Apps hand-roll `try { localStorage.getItem / setItem } catch` everywhere; this
 * consolidates it: reads never throw, writes report success (false on quota /
 * disabled storage) and try to free space by pruning old DEX keys before giving
 * up. The JSON variants fold in `safeJsonParse` so a corrupt/wrong-shape value
 * degrades to a known default. (Zustand persist should still use
 * `debouncedStorage`; this is for direct per-app reads/writes.)
 */

import { safeJsonParse, safeJsonStringify } from './safeJson';

function available(): boolean {
  return typeof localStorage !== 'undefined';
}

export function getItem(key: string): string | null {
  if (!available()) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Remove the oldest dex-* key(s) to reclaim quota. Best-effort. */
function pruneOldestDexKeys(count: number): void {
  if (!available()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('dex-') || k.startsWith('dex.'))) keys.push(k);
    }
    keys.slice(0, count).forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }
}

export function setItem(key: string, value: string): boolean {
  if (!available()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      pruneOldestDexKeys(2);
      try { localStorage.setItem(key, value); return true; } catch { return false; }
    }
    return false;
  }
}

export function removeItem(key: string): void {
  if (!available()) return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Read + JSON-parse a key, falling back (and optionally validating the shape). */
export function getJSON<T>(key: string, fallback: T, validate?: (v: unknown) => boolean): T {
  return safeJsonParse<T>(getItem(key), fallback, validate);
}

/** JSON-stringify + write a key. Returns false if it couldn't persist. */
export function setJSON(key: string, value: unknown): boolean {
  return setItem(key, safeJsonStringify(value));
}

/** Namespaced helpers so an app owns its own key prefix without collisions. */
export function namespaced(appId: string) {
  const k = (field: string) => `dex.${appId}.${field}`;
  return {
    getJSON: <T>(field: string, fallback: T, validate?: (v: unknown) => boolean) => getJSON<T>(k(field), fallback, validate),
    setJSON: (field: string, value: unknown) => setJSON(k(field), value),
    remove: (field: string) => removeItem(k(field)),
    key: k,
  };
}

export const safeStorage = { getItem, setItem, removeItem, getJSON, setJSON, namespaced };
export default safeStorage;
