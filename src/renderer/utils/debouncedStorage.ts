// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
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
import { persistOrWarn } from './persistOrWarn';

export function debouncedStorage(delayMs = 250): StateStorage & { flush(): void } {
  const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();
  const write = (name: string) => {
    const entry = pending.get(name);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(name);
    persistOrWarn(name, entry.value, 'your recent workspace changes');
  };

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

      const timer = setTimeout(() => write(name), delayMs);

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
    flush(): void {
      for (const name of [...pending.keys()]) write(name);
    },
  };
}

/** Singleton: shared 250ms debounced storage instance */
export const sharedDebouncedStorage = debouncedStorage(250);
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', sharedDebouncedStorage.flush);
  window.addEventListener('pagehide', sharedDebouncedStorage.flush);
}

/** Ready-to-use Zustand JSON storage with debouncing */
export const debouncedJsonStorage = createJSONStorage(() => sharedDebouncedStorage);

export default debouncedStorage;
