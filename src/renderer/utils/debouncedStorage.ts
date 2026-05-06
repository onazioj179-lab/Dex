// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX — Debounced Zustand Persistence Storage
 * ===========================================================================
 * Drop-in replacement for Zustand's default localStorage storage.
 * Debounces writes to avoid blocking the main thread on every state change.
 * Falls back gracefully if localStorage is full or unavailable.
 *
 * Usage:
 *   import { debouncedJsonStorage } from '../utils/debouncedStorage';
 *   const useStore = create(persist(storeConfig, {
 *     name: 'my-store',
 *     storage: debouncedJsonStorage,
 *   }));
 */

import { createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

export function debouncedStorage(delayMs = 250): StateStorage {
  const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

  return {
    getItem(name: string): string | null {
      // Reads are synchronous — always fresh from localStorage
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },

    setItem(name: string, value: string): void {
      const existing = pending.get(name);
      if (existing) clearTimeout(existing.timer);

      const timer = setTimeout(() => {
        pending.delete(name);
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          // Storage full — try to free space by removing oldest DEX keys
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            pruneOldestDexKeys(1);
            try {
              localStorage.setItem(name, value);
            } catch {
              // Give up silently — app will still work from memory
            }
          }
        }
      }, delayMs);

      pending.set(name, { value, timer });
    },

    removeItem(name: string): void {
      const existing = pending.get(name);
      if (existing) {
        clearTimeout(existing.timer);
        pending.delete(name);
      }
      try {
        localStorage.removeItem(name);
      } catch { /* ignore */ }
    },
  };
}

/** Remove the oldest dex-* key(s) to free localStorage space */
function pruneOldestDexKeys(count: number): void {
  const dexKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('dex-')) dexKeys.push(key);
  }
  // Sort by estimated age (localStorage doesn't track timestamps, so just take first N)
  dexKeys.slice(0, count).forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

/** Singleton: shared 250ms debounced storage instance */
export const sharedDebouncedStorage = debouncedStorage(250);

/** Ready-to-use Zustand JSON storage with debouncing */
export const debouncedJsonStorage = createJSONStorage(() => sharedDebouncedStorage);

export default debouncedStorage;
