// =============================================================================
// DEX Platform - Installed apps store (install / remove / reinstall / reset)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// App lifecycle: every DEX app ships installed. A user can REMOVE a
// (non-protected) app from the Store — it then disappears from the launcher,
// Home, command palette, app menu and spotlight — and REINSTALL it later from
// the Store. "Reset apps" restores the full default set. Only the removed set
// is persisted (empty = everything installed), so new apps added to
// APP_DEFINITIONS are installed by default.
//
// Matches the mandate: "install Dex apps... remove apps... reinstall the app...
// individually reset... default setting, that's when you can get the app back."

import { create } from 'zustand';

// Core apps that anchor the OS and can never be uninstalled. Removing Settings
// would strip the very screen you reinstall from; Home is the desktop; Store is
// where reinstall happens. Guarded in both the reducer and the UI.
export const PROTECTED_APP_IDS: ReadonlySet<string> = new Set([
  'home', 'settings', 'store', 'files', 'browser', 'taskmanager',
]);

export function canRemoveApp(appId: string): boolean {
  return !!appId && !PROTECTED_APP_IDS.has(appId);
}

// ---- Pure reducers (unit-tested independently of the store) ----------------

/** Add appId to the removed set (no-op for protected apps or duplicates). */
export function applyRemove(removed: readonly string[], appId: string): string[] {
  if (!canRemoveApp(appId) || removed.includes(appId)) return [...removed];
  return [...removed, appId];
}

/** Remove appId from the removed set (reinstall). */
export function applyReinstall(removed: readonly string[], appId: string): string[] {
  return removed.filter(id => id !== appId);
}

/** True when the app is currently installed (i.e. NOT in the removed set). */
export function isAppInstalled(removed: readonly string[], appId: string): boolean {
  return !removed.includes(appId);
}

/**
 * Filter a list of app-bearing items down to installed apps. Protected apps are
 * always kept even if somehow present in the removed set (defensive).
 */
export function filterInstalledItems<T>(
  items: readonly T[],
  getId: (item: T) => string,
  removed: readonly string[],
): T[] {
  const removedSet = new Set(removed);
  return items.filter(item => {
    const id = getId(item);
    return PROTECTED_APP_IDS.has(id) || !removedSet.has(id);
  });
}

// ---- Persisted store -------------------------------------------------------

interface InstalledAppsState {
  /** Ids the user has removed. Empty = all apps installed. */
  removedAppIds: string[];
  removeApp: (appId: string) => void;
  reinstallApp: (appId: string) => void;
  resetApps: () => void;
  isInstalled: (appId: string) => boolean;
}

const STORAGE_KEY = 'dex-removed-apps';

function loadRemoved(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Drop anything protected that might have been persisted by an older build.
    return parsed.filter((id): id is string => typeof id === 'string' && canRemoveApp(id));
  } catch {
    return [];
  }
}

function persistRemoved(ids: string[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* storage full */ }
}

export const useInstalledAppsStore = create<InstalledAppsState>()((set, get) => ({
  removedAppIds: loadRemoved(),

  removeApp: (appId) => {
    const next = applyRemove(get().removedAppIds, appId);
    persistRemoved(next);
    set({ removedAppIds: next });
    // notify consumers (launcher, home, palette) to re-derive their app lists
    try { window.dispatchEvent(new CustomEvent('dex-apps-changed', { detail: { appId, action: 'remove' } })); } catch { /* noop */ }
  },

  reinstallApp: (appId) => {
    const next = applyReinstall(get().removedAppIds, appId);
    persistRemoved(next);
    set({ removedAppIds: next });
    try { window.dispatchEvent(new CustomEvent('dex-apps-changed', { detail: { appId, action: 'reinstall' } })); } catch { /* noop */ }
  },

  resetApps: () => {
    persistRemoved([]);
    set({ removedAppIds: [] });
    try { window.dispatchEvent(new CustomEvent('dex-apps-changed', { detail: { action: 'reset' } })); } catch { /* noop */ }
  },

  isInstalled: (appId) => isAppInstalled(get().removedAppIds, appId),
}));
