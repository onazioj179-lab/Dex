// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// RECENT FILES STORE - Unified recent-files tracking across DEX apps
// ===========================================================================

import { create } from 'zustand';

export interface RecentFile {
  path: string;
  name: string;
  appId: string;
  openedAt: number;
}

interface RecentFilesState {
  recentFiles: RecentFile[];
  addRecent: (file: Omit<RecentFile, 'openedAt'>) => void;
  removeRecent: (path: string) => void;
  clearRecents: () => void;
}

const STORAGE_KEY = 'dex-recent-files';
const MAX_RECENTS = 50;

function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persist(files: RecentFile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(files)); } catch { /* storage full */ }
}

export const useRecentFiles = create<RecentFilesState>()((set, get) => ({
  recentFiles: loadRecents(),

  addRecent: (file) => {
    const existing = get().recentFiles.filter(f => f.path !== file.path);
    const entry: RecentFile = { ...file, openedAt: Date.now() };
    const next = [entry, ...existing].slice(0, MAX_RECENTS);
    persist(next);
    set({ recentFiles: next });
  },

  removeRecent: (path) => {
    const next = get().recentFiles.filter(f => f.path !== path);
    persist(next);
    set({ recentFiles: next });
  },

  clearRecents: () => {
    persist([]);
    set({ recentFiles: [] });
  },
}));
