// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Dock Pinning Store
 * Pin/unpin apps to dock, drag reorder, persistence via localStorage.
 * Home, Rewind, Settings are permanent (cannot be unpinned).
 * Dock modes: always-visible, auto-hide, floating.
 * Magnification: gaussian hover effect on dock icons.
 */

import { create } from 'zustand';

export interface DockPin {
  id: string;
  position: number;
}

export type DockMode = 'always-visible' | 'auto-hide' | 'floating';

interface DockPinState {
  pins: DockPin[];
  mode: DockMode;
  magnification: boolean;
  magnificationScale: number;
  iconSize: number;
  // Actions
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  isPinned: (appId: string) => boolean;
  setMode: (mode: DockMode) => void;
  setMagnification: (enabled: boolean) => void;
  setMagnificationScale: (scale: number) => void;
  setIconSize: (size: number) => void;
}

const PERMANENT_PINS = ['rewind', 'settings'];
const STORAGE_KEY = 'dex-dock-pins';
const SETTINGS_KEY = 'dex-dock-settings';
const MAX_PINS = 100;

const DEFAULT_PINS: DockPin[] = [
  { id: 'browser', position: 0 },
  { id: 'files', position: 1 },
  { id: 'notes', position: 2 },
  { id: 'gallery', position: 3 },
  { id: 'calendar', position: 4 },
  { id: 'calculator', position: 5 },
  { id: 'settings', position: 6 },
  { id: 'rewind', position: 7 },
];

function loadPins(): DockPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure permanent pins exist
        const ids = new Set(parsed.map((p: DockPin) => p.id));
        let maxPos = Math.max(...parsed.map((p: DockPin) => p.position));
        for (const permId of PERMANENT_PINS) {
          if (!ids.has(permId)) {
            maxPos++;
            parsed.push({ id: permId, position: maxPos });
          }
        }
        return parsed.sort((a: DockPin, b: DockPin) => a.position - b.position);
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_PINS;
}

function savePins(pins: DockPin[]) {
  try {
    const json = JSON.stringify(pins);
    localStorage.setItem(STORAGE_KEY, json);
    (window as any).electron?.invoke?.('capability:storage:set', STORAGE_KEY, json).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

interface DockSettings {
  mode: DockMode;
  magnification: boolean;
  magnificationScale: number;
  iconSize: number;
}

const DEFAULT_SETTINGS: DockSettings = {
  mode: 'auto-hide',
  magnification: true,
  magnificationScale: 1.15,
  iconSize: 48,
};

function loadSettings(): DockSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function saveSettings(s: DockSettings): void {
  try {
    const json = JSON.stringify(s);
    localStorage.setItem(SETTINGS_KEY, json);
    (window as any).electron?.invoke?.('capability:storage:set', SETTINGS_KEY, json).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

// Async IPC load — overrides localStorage state on startup
async function loadPinsAsync(): Promise<DockPin[] | null> {
  try {
    const raw = await (window as any).electron?.invoke?.('capability:storage:get', STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ids = new Set(parsed.map((p: DockPin) => p.id));
        let maxPos = Math.max(...parsed.map((p: DockPin) => p.position));
        for (const permId of PERMANENT_PINS) {
          if (!ids.has(permId)) { maxPos++; parsed.push({ id: permId, position: maxPos }); }
        }
        return parsed.sort((a: DockPin, b: DockPin) => a.position - b.position);
      }
    }
  } catch { /* fallback to localStorage */ }
  return null;
}

async function loadSettingsAsync(): Promise<DockSettings | null> {
  try {
    const raw = await (window as any).electron?.invoke?.('capability:storage:get', SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fallback */ }
  return null;
}

export const useDockPins = create<DockPinState>((set, get) => {
  const initialSettings = loadSettings();

  // Load from IPC backend on startup (overrides localStorage)
  loadPinsAsync().then(pins => { if (pins) set({ pins }); }).catch((e: unknown) => { console.warn('[DEX]', e); });
  loadSettingsAsync().then(s => { if (s) set({ mode: s.mode, magnification: s.magnification, magnificationScale: s.magnificationScale, iconSize: s.iconSize }); }).catch((e: unknown) => { console.warn('[DEX]', e); });

  return {
    pins: loadPins(),
    mode: initialSettings.mode,
    magnification: initialSettings.magnification,
    magnificationScale: initialSettings.magnificationScale,
    iconSize: initialSettings.iconSize,

  pinApp: (appId: string) => {
    const { pins } = get();
    if (pins.some(p => p.id === appId)) return;
    if (pins.length >= MAX_PINS) return;
    const maxPos = pins.length > 0 ? Math.max(...pins.map(p => p.position)) + 1 : 0;
    const next = [...pins, { id: appId, position: maxPos }];
    savePins(next);
    set({ pins: next });
  },

  unpinApp: (appId: string) => {
    if (PERMANENT_PINS.includes(appId)) return;
    const { pins } = get();
    const next = pins
      .filter(p => p.id !== appId)
      .map((p, i) => ({ ...p, position: i }));
    savePins(next);
    set({ pins: next });
  },

  reorder: (fromIndex: number, toIndex: number) => {
    const { pins } = get();
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= pins.length || toIndex >= pins.length) return;
    const sorted = [...pins].sort((a, b) => a.position - b.position);
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    const next = sorted.map((p, i) => ({ ...p, position: i }));
    savePins(next);
    set({ pins: next });
  },

  isPinned: (appId: string) => {
    return get().pins.some(p => p.id === appId);
  },

  setMode: (mode: DockMode) => {
    set({ mode });
    const s = loadSettings();
    saveSettings({ ...s, mode });
  },

  setMagnification: (enabled: boolean) => {
    set({ magnification: enabled });
    const s = loadSettings();
    saveSettings({ ...s, magnification: enabled });
  },

  setMagnificationScale: (scale: number) => {
    const clamped = Math.max(1.0, Math.min(2.0, scale));
    set({ magnificationScale: clamped });
    const s = loadSettings();
    saveSettings({ ...s, magnificationScale: clamped });
  },

  setIconSize: (size: number) => {
    const clamped = Math.max(32, Math.min(72, size));
    set({ iconSize: clamped });
    const s = loadSettings();
    saveSettings({ ...s, iconSize: clamped });
  },
  };
});

export { PERMANENT_PINS };

// Selector-based subscriptions (item 146)
export const usePinnedApps = () => useDockPins(s => s.pins);
export const useDockMode = () => useDockPins(s => s.mode);
export const useDockMagnification = () => useDockPins(s => s.magnification);
export const useDockIconSize = () => useDockPins(s => s.iconSize);
