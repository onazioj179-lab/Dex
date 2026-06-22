// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * usePersistentState — useState that survives reload + app re-mount.
 *
 * One safe, typed home for the "last tab / filter / scroll / view-mode restored
 * on relaunch" pattern that every app re-implements with ad-hoc try/catch around
 * localStorage. Reads are lazy and guarded; writes are guarded (quota/disabled
 * storage never throw into render). Use `useAppUIState(appId, ...)` to namespace
 * a key per app so two apps can't clobber each other's persisted UI state.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded / storage disabled — persistence is best-effort */
  }
}

/**
 * Like `useState<T>` but the value is persisted to localStorage under `key` and
 * restored on the next mount. `initial` may be a value or a lazy factory.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
    return safeRead<T>(key, fallback);
  });

  // Persist on change. Skip the very first run so we don't immediately rewrite
  // the value we just read (avoids a redundant write on mount).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    safeWrite(key, value);
  }, [key, value]);

  return [value, setValue];
}

/**
 * Namespaced per-app UI state. `useAppUIState('kanban', 'sort', {...})` stores
 * under `dex-uistate:kanban:sort`, so each app owns its slice without collisions.
 */
export function useAppUIState<T>(
  appId: string,
  field: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  return usePersistentState<T>(`dex-uistate:${appId}:${field}`, initial);
}

/** Imperative read of a persisted UI value (non-React call sites). */
export function readPersisted<T>(key: string, fallback: T): T {
  return safeRead<T>(key, fallback);
}

/** Imperative write of a persisted UI value. */
export function writePersisted(key: string, value: unknown): void {
  safeWrite(key, value);
}

/** Clear a namespaced app UI field (used by "reset this app" actions). */
export function clearAppUIState(appId: string, field: string): void {
  try { localStorage.removeItem(`dex-uistate:${appId}:${field}`); } catch { /* ignore */ }
}

/**
 * Memoized callback that clears a key — handy for a "reset view" button.
 */
export function useClearPersisted(key: string): () => void {
  return useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }, [key]);
}
