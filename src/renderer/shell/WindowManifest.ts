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
const DEBOUNCE_MS = 1500;
let pending: ReturnType<typeof setTimeout> | null = null;
let lastWritten: WindowManifest | null = null;

export function captureManifest(windows: WindowSnapshot[], stageId?: string): WindowManifest {
  return {
    version: 1,
    capturedAt: Date.now(),
    stageId,
    windows,
  };
}

/** Schedule a debounced write to localStorage. Safe to call on every change. */
export function scheduleWrite(windows: WindowSnapshot[], stageId?: string): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    const manifest = captureManifest(windows, stageId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
      lastWritten = manifest;
    } catch { /* storage full -- ignore */ }
  }, DEBOUNCE_MS);
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

/** Synchronously flush any pending debounced write. Call before app exit. */
export function flush(): void {
  if (!pending) return;
  clearTimeout(pending);
  pending = null;
  if (lastWritten) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lastWritten)); } catch { /* ignore */ }
  }
}

/** Clear the manifest -- used after a successful "discard" recovery choice. */
export function clearManifest(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  lastWritten = null;
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
