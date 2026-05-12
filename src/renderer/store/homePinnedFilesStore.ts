// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { create } from 'zustand';

export interface HomePinnedFile {
  id: string;
  path: string;
  name: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
}

interface HomePinnedFilesState {
  pinnedFiles: HomePinnedFile[];
  pinFile: (file: { path: string; name?: string }, position?: { x: number; y: number }) => void;
  unpinFile: (id: string) => void;
  movePinnedFile: (id: string, x: number, y: number) => void;
}

const STORAGE_KEY = 'dex-home-pinned-files';
const MAX_PINNED_FILES = 80;

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || path || 'Pinned file';
}

function loadPinnedFiles(): HomePinnedFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item.path === 'string' && typeof item.id === 'string');
  } catch {
    return [];
  }
}

function persistPinnedFiles(files: HomePinnedFile[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(files)); } catch { /* storage full */ }
}

export const useHomePinnedFilesStore = create<HomePinnedFilesState>()((set, get) => ({
  pinnedFiles: loadPinnedFiles(),

  pinFile: (file, position) => {
    const path = file.path.trim();
    if (!path) return;
    const now = Date.now();
    const existing = get().pinnedFiles.filter(item => item.path !== path);
    const offset = existing.length * 14;
    const nextFile: HomePinnedFile = {
      id: `pinned_file_${now}_${Math.random().toString(36).slice(2, 8)}`,
      path,
      name: file.name || fileNameFromPath(path),
      x: Math.max(8, position?.x ?? 48 + offset),
      y: Math.max(72, position?.y ?? 220 + offset),
      createdAt: now,
      updatedAt: now,
    };
    const next = [nextFile, ...existing].slice(0, MAX_PINNED_FILES);
    persistPinnedFiles(next);
    set({ pinnedFiles: next });
  },

  unpinFile: (id) => {
    const next = get().pinnedFiles.filter(item => item.id !== id);
    persistPinnedFiles(next);
    set({ pinnedFiles: next });
  },

  movePinnedFile: (id, x, y) => {
    const next = get().pinnedFiles.map(item => item.id === id
      ? { ...item, x: Math.max(8, x), y: Math.max(56, y), updatedAt: Date.now() }
      : item);
    persistPinnedFiles(next);
    set({ pinnedFiles: next });
  },
}));