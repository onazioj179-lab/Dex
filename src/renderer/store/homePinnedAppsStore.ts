// =============================================================================
// DEX Platform - Home pinned apps store
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//
// Mac-style "pin app anywhere on Home" store. Mirrors homePinnedFilesStore
// but stores app shortcuts keyed by appId, with free x/y coordinates so the
// user can drop them anywhere on the desktop.

import { create } from 'zustand';

export interface HomePinnedApp {
  id: string;       // unique pin id
  appId: string;    // key into APP_DEFINITIONS
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
}

interface HomePinnedAppsState {
  pinnedApps: HomePinnedApp[];
  pinApp: (appId: string, position?: { x: number; y: number }) => void;
  unpinApp: (id: string) => void;
  unpinAppByAppId: (appId: string) => void;
  movePinnedApp: (id: string, x: number, y: number) => void;
  isAppPinned: (appId: string) => boolean;
}

const STORAGE_KEY = 'dex-home-pinned-apps';
const MAX_PINNED_APPS = 60;

function loadPinnedApps(): HomePinnedApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item =>
      item
      && typeof item.id === 'string'
      && typeof item.appId === 'string'
      && typeof item.x === 'number'
      && typeof item.y === 'number'
    );
  } catch {
    return [];
  }
}

function persistPinnedApps(apps: HomePinnedApp[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(apps)); } catch { /* storage full */ }
}

export const useHomePinnedAppsStore = create<HomePinnedAppsState>()((set, get) => ({
  pinnedApps: loadPinnedApps(),

  pinApp: (appId, position) => {
    if (!appId) return;
    const existingPin = get().pinnedApps.find(item => item.appId === appId);
    if (existingPin) return; // already pinned -- ignore duplicate
    const now = Date.now();
    const offset = get().pinnedApps.length * 14;
    const next: HomePinnedApp = {
      id: `pinned_app_${now}_${Math.random().toString(36).slice(2, 8)}`,
      appId,
      x: Math.max(8, position?.x ?? 48 + offset),
      y: Math.max(72, position?.y ?? 320 + offset),
      createdAt: now,
      updatedAt: now,
    };
    const all = [next, ...get().pinnedApps].slice(0, MAX_PINNED_APPS);
    persistPinnedApps(all);
    set({ pinnedApps: all });
  },

  unpinApp: (id) => {
    const next = get().pinnedApps.filter(item => item.id !== id);
    persistPinnedApps(next);
    set({ pinnedApps: next });
  },

  unpinAppByAppId: (appId) => {
    const next = get().pinnedApps.filter(item => item.appId !== appId);
    persistPinnedApps(next);
    set({ pinnedApps: next });
  },

  movePinnedApp: (id, x, y) => {
    const next = get().pinnedApps.map(item => item.id === id
      ? { ...item, x: Math.max(8, x), y: Math.max(56, y), updatedAt: Date.now() }
      : item);
    persistPinnedApps(next);
    set({ pinnedApps: next });
  },

  isAppPinned: (appId) => get().pinnedApps.some(item => item.appId === appId),
}));
