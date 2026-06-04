// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * User-controlled autosave interval (Wave 1 — creative-platform consistency,
 * catalog CRT-019 / SHL-066). The shared `useAutoSave` hook hardcoded 30s; this
 * lets the user tune one interval that applies to every app *without* editing
 * each call site: the hook reads `getAutosaveIntervalOverride()` and only falls
 * back to the call site's own value when the user has not set a preference.
 *
 * Pure + persisted (localStorage). No DOM. Defaults to "no override" (null) so
 * behaviour is unchanged until the user opts in.
 */

const STORAGE_KEY = 'dex-autosave-interval-ms';

/** Hard bounds so a stray value can never disable saving or thrash the disk. */
export const MIN_AUTOSAVE_INTERVAL_MS = 5_000; // 5s
export const MAX_AUTOSAVE_INTERVAL_MS = 600_000; // 10m

/** Clamp an arbitrary number into the safe autosave range. */
export function clampAutosaveInterval(ms: number): number {
  if (!Number.isFinite(ms)) return MIN_AUTOSAVE_INTERVAL_MS;
  return Math.min(MAX_AUTOSAVE_INTERVAL_MS, Math.max(MIN_AUTOSAVE_INTERVAL_MS, Math.round(ms)));
}

/**
 * The user's chosen interval in ms, or `null` when unset (apps keep their own
 * default). Clamped on read so a corrupted value can never break autosave.
 */
export function getAutosaveIntervalOverride(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return clampAutosaveInterval(n);
  } catch {
    return null;
  }
}

/** Set (or, with `null`, clear) the user's autosave interval preference. */
export function setAutosaveIntervalOverride(ms: number | null): void {
  try {
    if (ms == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(clampAutosaveInterval(ms)));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/**
 * Resolve the effective interval for a call site: the user's override when set,
 * otherwise the app's own default (also clamped for safety).
 */
export function resolveAutosaveInterval(fallbackMs: number): number {
  const override = getAutosaveIntervalOverride();
  return override ?? clampAutosaveInterval(fallbackMs);
}
