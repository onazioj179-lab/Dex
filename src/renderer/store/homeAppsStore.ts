// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Home Quick Access Apps Store
 * Customizable apps shown on home screen.
 * Users can add/remove apps via right-click context menu.
 */

import { create } from 'zustand';

export interface HomeApp {
  id: string;
  position: number;
}

interface HomeAppsState {
  apps: HomeApp[];
  // Actions
  addApp: (appId: string) => void;
  removeApp: (appId: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  hasApp: (appId: string) => boolean;
  reset: () => void;
}

const STORAGE_KEY = 'dex-home-apps';

// Default 4 apps - creative suite
const DEFAULT_APPS: HomeApp[] = [
  { id: 'videoeditor', position: 0 },
  { id: 'imosion', position: 1 },
  { id: 'forge', position: 2 },
  { id: 'nexus', position: 3 },
];

function loadApps(): HomeApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a: HomeApp, b: HomeApp) => a.position - b.position);
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_APPS;
}

function saveApps(apps: HomeApp[]) {
  try {
    const json = JSON.stringify(apps);
    localStorage.setItem(STORAGE_KEY, json);
  } catch { /* ignore */ }
}

export const useHomeAppsStore = create<HomeAppsState>((set, get) => ({
  apps: loadApps(),

  addApp: (appId: string) => {
    const { apps } = get();
    if (apps.some(a => a.id === appId)) return; // already added
    const maxPos = apps.length > 0 ? Math.max(...apps.map(a => a.position)) + 1 : 0;
    const newApps = [...apps, { id: appId, position: maxPos }];
    set({ apps: newApps });
    saveApps(newApps);
  },

  removeApp: (appId: string) => {
    const { apps } = get();
    const newApps = apps.filter(a => a.id !== appId);
    // Reindex positions
    newApps.forEach((a, i) => { a.position = i; });
    set({ apps: newApps });
    saveApps(newApps);
  },

  reorder: (fromIndex: number, toIndex: number) => {
    const { apps } = get();
    const newApps = [...apps];
    const [moved] = newApps.splice(fromIndex, 1);
    newApps.splice(toIndex, 0, moved);
    newApps.forEach((a, i) => { a.position = i; });
    set({ apps: newApps });
    saveApps(newApps);
  },

  hasApp: (appId: string) => {
    return get().apps.some(a => a.id === appId);
  },

  reset: () => {
    set({ apps: DEFAULT_APPS });
    saveApps(DEFAULT_APPS);
  },
}));

export { DEFAULT_APPS };
