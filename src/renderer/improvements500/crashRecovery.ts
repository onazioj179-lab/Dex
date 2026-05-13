// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Crash-safe state autosave + recovery (T6-047, T9-007).
 *
 * Wraps a serializable store: autosaves on debounce; on next launch,
 * `loadRecovery` returns the saved snapshot if present and clears it.
 */

const PREFIX = 'dex:recovery:';
const COMMITTED_PREFIX = 'dex:recovery:committed:';

export interface Recovery<T> { savedTs: number; data: T; }

function isBrowser(): boolean {
  return typeof localStorage !== 'undefined';
}

export function saveRecovery<T>(key: string, data: T): void {
  if (!isBrowser()) return;
  try {
    const payload: Recovery<T> = { savedTs: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(payload));
  } catch { /* quota */ }
}

/** Loads recovery and immediately clears the slot. */
export function loadRecovery<T>(key: string): Recovery<T> | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    localStorage.removeItem(PREFIX + key);
    return JSON.parse(raw) as Recovery<T>;
  } catch { return null; }
}

export function hasRecovery(key: string): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(PREFIX + key) !== null;
}

/** Mark the current session as committed (clean shutdown). */
export function commitClean(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PREFIX + key);
  localStorage.setItem(COMMITTED_PREFIX + key, String(Date.now()));
}

/** True when the previous session crashed (recovery present at boot). */
export function previousSessionCrashed(key: string): boolean {
  return hasRecovery(key);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced autosave: coalesces frequent saves into one write per delay. */
export function autoSave<T>(key: string, data: T, delayMs = 1500): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => saveRecovery(key, data), delayMs);
}
