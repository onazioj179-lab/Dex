// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX App Pinning Store -- the ONE pinning service for apps.
 * Two ordered pin lists, keyed by stable app id (APP_DEFINITIONS):
 *   - pins      -> the Dock (the DEX Bar's pinned strip + Home "Pinned Apps")
 *   - menuPins  -> the App Menu's Pinned section
 * Every surface (App Menu, context menus, title-bar menu, search results,
 * Home) pins through this store via services/appPinning.ts, so there are no
 * competing pin systems. Any app may be pinned or unpinned; nothing is
 * permanent. Persisted to localStorage and mirrored to native storage.
 */

import { create } from 'zustand';

export interface DockPin {
  id: string;
  position: number;
}

export type DockMode = 'always-visible' | 'auto-hide' | 'floating';

interface DockPinState {
  pins: DockPin[];
  /** App Menu pinned section, in display order. */
  menuPins: string[];
  mode: DockMode;
  magnification: boolean;
  magnificationScale: number;
  iconSize: number;
  // Actions
  pinApp: (appId: string) => void;
  unpinApp: (appId: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  isPinned: (appId: string) => boolean;
  /** Move (or insert) a dock pin at an index -- drag-to-reorder and drop-to-pin. */
  moveTo: (appId: string, toIndex: number) => void;
  pinToMenu: (appId: string) => void;
  unpinFromMenu: (appId: string) => void;
  reorderMenu: (fromIndex: number, toIndex: number) => void;
  isMenuPinned: (appId: string) => boolean;
  setMode: (mode: DockMode) => void;
  setMagnification: (enabled: boolean) => void;
  setMagnificationScale: (scale: number) => void;
  setIconSize: (size: number) => void;
}

// Nothing is permanently pinned any more: users can unpin any app. Kept as an
// (empty) export for older imports.
const PERMANENT_PINS: string[] = [];
const STORAGE_KEY = 'dex-dock-pins';
const MENU_KEY = 'dex-menu-pins';
const SETTINGS_KEY = 'dex-dock-settings';
const MAX_PINS = 24;
const MAX_MENU_PINS = 18;

// A short default so the DEX Bar stays compact; users pin what they use.
const DEFAULT_PINS: DockPin[] = [
  { id: 'files', position: 0 },
  { id: 'browser', position: 1 },
  { id: 'notes', position: 2 },
  { id: 'settings', position: 3 },
];
const DEFAULT_MENU_PINS = ['files', 'browser', 'notes', 'calendar', 'ledger', 'settings'];

/** Dedupe by id and renumber positions, keeping the first occurrence. */
function normalizePins(list: unknown): DockPin[] | null {
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const out: DockPin[] = [];
  for (const p of [...list].sort((a: DockPin, b: DockPin) => (a?.position ?? 0) - (b?.position ?? 0))) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push({ id: p.id, position: out.length });
  }
  return out.slice(0, MAX_PINS);
}

function normalizeMenu(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  return Array.from(new Set(list.filter((x): x is string => typeof x === 'string' && !!x))).slice(0, MAX_MENU_PINS);
}

function loadPins(): DockPin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // An empty saved list is a real choice (the user unpinned everything).
    if (raw !== null) return normalizePins(JSON.parse(raw)) ?? DEFAULT_PINS.map(p => ({ ...p }));
  } catch { /* ignore */ }
  return DEFAULT_PINS.map(p => ({ ...p }));
}

function loadMenuPins(): string[] {
  try {
    const raw = localStorage.getItem(MENU_KEY);
    if (raw !== null) return normalizeMenu(JSON.parse(raw)) ?? [...DEFAULT_MENU_PINS];
  } catch { /* ignore */ }
  return [...DEFAULT_MENU_PINS];
}

function saveMenuPins(pins: string[]) {
  try {
    const json = JSON.stringify(pins);
    localStorage.setItem(MENU_KEY, json);
    (window as any).dex?.invoke?.('capability:storage:set', MENU_KEY, json)?.catch?.((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

function savePins(pins: DockPin[]) {
  try {
    const json = JSON.stringify(pins);
    localStorage.setItem(STORAGE_KEY, json);
    (window as any).dex?.invoke?.('capability:storage:set', STORAGE_KEY, json).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

interface DockSettings {
  mode: DockMode;
  magnification: boolean;
  magnificationScale: number;
  iconSize: number;
  /** Settings schema version -- drives one-time migrations. */
  version?: number;
}

// v6.0 OS-grade arrangement: the dock now reserves its own space at the screen
// edge (taskbar behavior) instead of floating over and clipping app content.
// Pinned/visible is the default; auto-hide remains an explicit opt-in.
const SETTINGS_VERSION = 6;

const DEFAULT_SETTINGS: DockSettings = {
  mode: 'always-visible',
  // Owner direction: the dock stays still — no hover magnification by default.
  // (AppManager also hard-disables the effect regardless of saved value.)
  magnification: false,
  magnificationScale: 1.15,
  iconSize: 40,
  version: SETTINGS_VERSION,
};

// One-time upgrade of legacy installs: flip the old auto-hide default (which
// overlaid and clipped app toolbars/status bars) to the space-reserving pinned
// dock. An explicit auto-hide choice made AFTER this migration is preserved,
// because saveSettings stamps the current version so this guard no longer matches.
function migrateSettings(s: DockSettings): DockSettings {
  if ((s.version ?? 0) < SETTINGS_VERSION) {
    if (s.mode === 'auto-hide') s.mode = 'always-visible';
    s.version = SETTINGS_VERSION;
  }
  return s;
}

function loadSettings(): DockSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate the RAW stored object first (so a missing version reads as 0),
      // then layer defaults underneath for any absent fields. Merging defaults
      // in before migration would mask the missing version as the current one.
      return { ...DEFAULT_SETTINGS, ...migrateSettings(parsed) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: DockSettings): void {
  try {
    const json = JSON.stringify({ ...s, version: SETTINGS_VERSION });
    localStorage.setItem(SETTINGS_KEY, json);
    (window as any).dex?.invoke?.('capability:storage:set', SETTINGS_KEY, json).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* ignore */ }
}

// Async IPC load — overrides localStorage state on startup
async function loadPinsAsync(): Promise<DockPin[] | null> {
  try {
    const raw = await (window as any).dex?.invoke?.('capability:storage:get', STORAGE_KEY);
    if (typeof raw === 'string') return normalizePins(JSON.parse(raw));
  } catch { /* fallback to localStorage */ }
  return null;
}

async function loadMenuPinsAsync(): Promise<string[] | null> {
  try {
    const raw = await (window as any).dex?.invoke?.('capability:storage:get', MENU_KEY);
    if (typeof raw === 'string') return normalizeMenu(JSON.parse(raw));
  } catch { /* fallback */ }
  return null;
}

async function loadSettingsAsync(): Promise<DockSettings | null> {
  try {
    const raw = await (window as any).dex?.invoke?.('capability:storage:get', SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...migrateSettings(JSON.parse(raw)) };
  } catch { /* fallback */ }
  return null;
}

export const useDockPins = create<DockPinState>((set, get) => {
  const initialSettings = loadSettings();

  // Load from IPC backend on startup (overrides localStorage)
  loadPinsAsync().then(pins => { if (pins) set({ pins }); }).catch((e: unknown) => { console.warn('[DEX]', e); });
  loadMenuPinsAsync().then(menuPins => { if (menuPins) set({ menuPins }); }).catch((e: unknown) => { console.warn('[DEX]', e); });
  loadSettingsAsync().then(s => { if (s) set({ mode: s.mode, magnification: s.magnification, magnificationScale: s.magnificationScale, iconSize: s.iconSize }); }).catch((e: unknown) => { console.warn('[DEX]', e); });

  return {
    pins: loadPins(),
    menuPins: loadMenuPins(),
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
    const { pins } = get();
    if (!pins.some(p => p.id === appId)) return;
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

  moveTo: (appId: string, toIndex: number) => {
    const all = [...get().pins].sort((a, b) => a.position - b.position);
    const wasPinned = all.some(p => p.id === appId);
    if (!wasPinned && all.length >= MAX_PINS) return;
    const rest = all.filter(p => p.id !== appId);
    const at = Math.max(0, Math.min(toIndex, rest.length));
    rest.splice(at, 0, { id: appId, position: 0 });
    const next = rest.map((p, i) => ({ id: p.id, position: i }));
    savePins(next);
    set({ pins: next });
  },

  pinToMenu: (appId: string) => {
    const { menuPins } = get();
    if (menuPins.includes(appId) || menuPins.length >= MAX_MENU_PINS) return;
    const next = [...menuPins, appId];
    saveMenuPins(next);
    set({ menuPins: next });
  },

  unpinFromMenu: (appId: string) => {
    if (!get().menuPins.includes(appId)) return;
    const next = get().menuPins.filter(id => id !== appId);
    saveMenuPins(next);
    set({ menuPins: next });
  },

  reorderMenu: (fromIndex: number, toIndex: number) => {
    const list = [...get().menuPins];
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    saveMenuPins(list);
    set({ menuPins: list });
  },

  isMenuPinned: (appId: string) => get().menuPins.includes(appId),

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
export const useMenuPins = () => useDockPins(s => s.menuPins);
export const useDockMode = () => useDockPins(s => s.mode);
export const useDockMagnification = () => useDockPins(s => s.magnification);
export const useDockIconSize = () => useDockPins(s => s.iconSize);
