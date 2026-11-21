// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Window Manifest
 * -----------------------------------------------------------------------------
 * Compact, debounced snapshot of the current window layout (per display) used
 * by crash recovery and "restore previous session". Lives in localStorage to
 * survive renderer crashes; the main process can mirror it to disk later.
 *
 * The manifest deliberately avoids referencing app *state* -- it only records
 * window geometry, z-order, and the (appId, windowId) tuple. Apps own their
 * own state via stores / .dexproject.
 */

export interface WindowSnapshot {
  appId: string;
  windowId?: string;
  /** Display id this window was on (when known). */
  displayId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized?: boolean;
  maximized?: boolean;
  restoreBounds?: { x: number; y: number; w: number; h: number };
  focused?: boolean;
}

export interface WindowManifest {
  version: 1;
  capturedAt: number;
  /** Active stage at capture time, if any. */
  stageId?: string;
  windows: WindowSnapshot[];
}

const STORAGE_KEY = 'dex-window-manifest';
// Throttle (NOT a pure trailing debounce): persist on the leading edge, then at
// most once per THROTTLE_MS, ALWAYS keeping the latest snapshot. This guarantees a
// write at least every THROTTLE_MS even under continuous changes -- so a force-kill
// loses at most THROTTLE_MS of layout. The old pure-trailing debounce reset on
// every change and could starve (never writing during a drag/resize storm), losing
// far more than its nominal window.
const THROTTLE_MS = 1000;
let pending: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;
// The most recent snapshot handed to scheduleWrite but not yet persisted.
let pendingWindows: { windows: WindowSnapshot[]; stageId?: string } | null = null;

export function captureManifest(windows: WindowSnapshot[], stageId?: string): WindowManifest {
  return {
    version: 1,
    capturedAt: Date.now(),
    stageId,
    windows,
  };
}

/** Persist the pending snapshot to localStorage right now (internal). */
function writeNow(): void {
  if (pending) { clearTimeout(pending); pending = null; }
  if (!pendingWindows) return;
  const manifest = captureManifest(pendingWindows.windows, pendingWindows.stageId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
  } catch { /* storage full -- ignore */ }
  lastWriteAt = Date.now();
  pendingWindows = null;
}

/** Throttled write to localStorage. Safe to call on every change: writes on the
 *  leading edge, then at most once per THROTTLE_MS, always persisting the latest. */
export function scheduleWrite(windows: WindowSnapshot[], stageId?: string): void {
  pendingWindows = { windows, stageId };
  if (pending) return; // a trailing write is already queued; it picks up the latest
  const elapsed = Date.now() - lastWriteAt;
  if (elapsed >= THROTTLE_MS) {
    writeNow();
  } else {
    pending = setTimeout(writeNow, THROTTLE_MS - elapsed);
  }
}

/** Read the most recently persisted manifest, or null if missing/invalid. */
export function loadManifest(): WindowManifest | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.windows)) return null;
    return parsed as WindowManifest;
  } catch {
    return null;
  }
}

/** Synchronously flush any pending write. Call before app exit (beforeunload). */
export function flush(): void {
  if (pendingWindows) writeNow();
}

/** Clear the manifest -- used after a successful "discard" recovery choice. */
export function clearManifest(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  pendingWindows = null;
  if (pending) { clearTimeout(pending); pending = null; }
}

/** Has the manifest changed in a meaningful way since last write? Cheap diff. */
export function isDifferent(prev: WindowManifest | null, next: WindowManifest): boolean {
  if (!prev) return true;
  if (prev.windows.length !== next.windows.length) return true;
  if (prev.stageId !== next.stageId) return true;
  for (let i = 0; i < next.windows.length; i++) {
    const a = prev.windows[i];
    const b = next.windows[i];
    if (a.appId !== b.appId || a.windowId !== b.windowId) return true;
    if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) return true;
    if (a.z !== b.z || !!a.minimized !== !!b.minimized || !!a.maximized !== !!b.maximized) return true;
  }
  return false;
}
