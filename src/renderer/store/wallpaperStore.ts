// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX Wallpaper Store
 * Manages desktop wallpaper state background images, gradients, blur,
 * opacity, and built-in presets.  Persists to localStorage.
 * ===========================================================================
 */

import { create } from 'zustand';

const ISLAND_DARK_WALLPAPER = new URL('../../../imagewallpapers/island-dark.jpg', import.meta.url).href;
const SAND_DUNES_WALLPAPER = new URL('../../../imagewallpapers/sand-dunes-tower-tranquil-black-white-generative-ai.jpg', import.meta.url).href;

// ===========================================================================
// TYPES
// ===========================================================================

export type WallpaperMode = 'gradient' | 'image' | 'solid' | 'live';

export interface WallpaperPreset {
  id: string;
  name: string;
  mode: WallpaperMode;
  value: string;          // CSS gradient, url(), or solid color
  thumbnail?: string;     // small preview gradient/color for the picker
}

export interface WallpaperState {
  // Current wallpaper
  mode: WallpaperMode;
  value: string;
  presetId: string;
  blur: number;           // px  applied on top of wallpaper
  opacity: number;        // 0-1 glass overlay opacity
  tint: string;           // rgba overlay tint

  // Actions
  setWallpaper: (preset: WallpaperPreset) => void;
  setCustomImage: (dataUrl: string) => void;
  setBlur: (blur: number) => void;
  setOpacity: (opacity: number) => void;
  setTint: (tint: string) => void;
  reset: () => void;
}

// ===========================================================================
// BUILT-IN PRESETS (macOS Tahoe inspired)
// ===========================================================================

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  // -- Solid tones (macOS Tahoe line-up) --
  { id: 'default-dark', name: 'Glass Black', mode: 'solid', value: '#0a0a0a', thumbnail: '#0a0a0a' },
  { id: 'graphite', name: 'Graphite', mode: 'solid', value: '#1c1c1e', thumbnail: '#1c1c1e' },
  { id: 'midnight', name: 'Midnight', mode: 'solid', value: '#0d1117', thumbnail: '#0d1117' },
  { id: 'ocean-floor', name: 'Ocean Floor', mode: 'solid', value: '#0a1628', thumbnail: '#0a1628' },
  // -- Built-in image wallpapers --
  { id: 'island-dark', name: 'Island Dark', mode: 'image', value: ISLAND_DARK_WALLPAPER, thumbnail: `url(${ISLAND_DARK_WALLPAPER})` },
  { id: 'sand-dunes', name: 'Sand Dunes Tower', mode: 'image', value: SAND_DUNES_WALLPAPER, thumbnail: `url(${SAND_DUNES_WALLPAPER})` },
  // -- Gradient — Tahoe-style layered gradients --
  { id: 'tahoe-aurora', name: 'Aurora', mode: 'gradient',
    value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)',
    thumbnail: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { id: 'tahoe-dawn', name: 'Dawn', mode: 'gradient',
    value: 'linear-gradient(160deg, #0d1b2a 0%, #1b2838 30%, #2d1b3d 60%, #4a1942 100%)',
    thumbnail: 'linear-gradient(160deg, #0d1b2a, #2d1b3d, #4a1942)' },
  { id: 'tahoe-ocean', name: 'Pacific', mode: 'gradient',
    value: 'linear-gradient(180deg, #0a1628 0%, #0d2137 25%, #0a3d62 50%, #1a5276 75%, #0a1628 100%)',
    thumbnail: 'linear-gradient(180deg, #0a1628, #0a3d62, #0a1628)' },
  { id: 'tahoe-dusk', name: 'Dusk', mode: 'gradient',
    value: 'linear-gradient(145deg, #141e30 0%, #243b55 35%, #2c3e50 65%, #1a1a2e 100%)',
    thumbnail: 'linear-gradient(145deg, #141e30, #243b55, #1a1a2e)' },
  { id: 'tahoe-ember', name: 'Ember', mode: 'gradient',
    value: 'linear-gradient(150deg, #1a0a0a 0%, #2d1114 30%, #4a1a1a 55%, #1a0a0a 100%)',
    thumbnail: 'linear-gradient(150deg, #1a0a0a, #4a1a1a, #1a0a0a)' },
  { id: 'tahoe-forest', name: 'Forest', mode: 'gradient',
    value: 'linear-gradient(160deg, #0a1a0a 0%, #0d2818 30%, #1a3a2a 55%, #0a1a0a 100%)',
    thumbnail: 'linear-gradient(160deg, #0a1a0a, #1a3a2a, #0a1a0a)' },
  { id: 'tahoe-nebula', name: 'Nebula', mode: 'gradient',
    value: 'radial-gradient(ellipse at 30% 50%, #1a0533 0%, #0d0221 30%, #190a33 60%, #0a0a1a 100%)',
    thumbnail: 'radial-gradient(circle, #1a0533, #0d0221, #0a0a1a)' },
  { id: 'tahoe-silk', name: 'Silk', mode: 'gradient',
    value: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 30%, #16213e 55%, #0f3460 80%, #0c0c0c 100%)',
    thumbnail: 'linear-gradient(135deg, #0c0c0c, #16213e, #0c0c0c)' },
  { id: 'tahoe-prism', name: 'Prism', mode: 'gradient',
    value: 'linear-gradient(135deg, #0d0d0d 0%, #1a0a2e 20%, #0a1a3e 40%, #0a2e2e 60%, #1a2e0a 80%, #0d0d0d 100%)',
    thumbnail: 'linear-gradient(135deg, #1a0a2e, #0a1a3e, #0a2e2e)' },
  { id: 'tahoe-sunset', name: 'Sunset', mode: 'gradient',
    value: 'linear-gradient(170deg, #0d1117 0%, #1a1a3a 25%, #3a1a2a 50%, #4a2a1a 70%, #0d1117 100%)',
    thumbnail: 'linear-gradient(170deg, #1a1a3a, #3a1a2a, #4a2a1a)' },
  // -- Black & Red --
  { id: 'crimson-dark', name: 'Crimson Dark', mode: 'solid', value: '#1a0000', thumbnail: '#1a0000' },
  { id: 'blood-moon', name: 'Blood Moon', mode: 'gradient',
    value: 'radial-gradient(ellipse at 50% 60%, #3a0000 0%, #1a0000 40%, #0a0000 70%, #000000 100%)',
    thumbnail: 'radial-gradient(circle, #3a0000, #1a0000, #000)' },
  { id: 'obsidian-ember', name: 'Obsidian Ember', mode: 'gradient',
    value: 'linear-gradient(160deg, #000000 0%, #1a0000 25%, #330000 50%, #1a0000 75%, #000000 100%)',
    thumbnail: 'linear-gradient(160deg, #000, #330000, #000)' },
  { id: 'scarlet-edge', name: 'Scarlet Edge', mode: 'gradient',
    value: 'linear-gradient(135deg, #0a0a0a 0%, #2a0a0a 20%, #4a0a0a 45%, #6b0f0f 55%, #2a0a0a 80%, #0a0a0a 100%)',
    thumbnail: 'linear-gradient(135deg, #0a0a0a, #4a0a0a, #6b0f0f, #0a0a0a)' },
  { id: 'inferno', name: 'Inferno', mode: 'gradient',
    value: 'linear-gradient(180deg, #000000 0%, #1c0505 20%, #3d0c0c 45%, #5c1010 60%, #3d0c0c 80%, #000000 100%)',
    thumbnail: 'linear-gradient(180deg, #000, #5c1010, #000)' },
  // -- Live Wallpapers (CSS animated) --
  { id: 'live-ember-pulse', name: 'Ember Pulse', mode: 'live',
    value: 'live-ember-pulse',
    thumbnail: 'linear-gradient(135deg, #1a0000, #3a0000, #0a0a0a)' },
  { id: 'live-aurora-shift', name: 'Aurora Shift', mode: 'live',
    value: 'live-aurora-shift',
    thumbnail: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { id: 'live-midnight-waves', name: 'Midnight Waves', mode: 'live',
    value: 'live-midnight-waves',
    thumbnail: 'linear-gradient(135deg, #0a1628, #0a3d62, #0d1117)' },
];

// ===========================================================================
// PERSISTENCE
// ===========================================================================

const STORAGE_KEY = 'dex-wallpaper';

function loadState(): Partial<WallpaperState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveState(s: Partial<WallpaperState>) {
  try {
    const data = JSON.stringify({
      mode: s.mode,
      value: s.value,
      presetId: s.presetId,
      blur: s.blur,
      opacity: s.opacity,
      tint: s.tint,
    });
    localStorage.setItem(STORAGE_KEY, data);
    (window as any).electron?.invoke?.('capability:storage:set', STORAGE_KEY, data).catch((e: unknown) => { console.warn('[DEX]', e); });
  } catch { /* */ }
}

// ===========================================================================
// DEFAULTS
// ===========================================================================

const DEFAULTS = {
  mode: 'image' as WallpaperMode,
  value: ISLAND_DARK_WALLPAPER,
  presetId: 'island-dark',
  blur: 0,
  opacity: 0.3,
  tint: 'rgba(0,0,0,0.15)',
};

// ===========================================================================
// STORE
// ===========================================================================

// If saved was from the old default (solid black), migrate to new image default
function migrateState(s: Partial<WallpaperState>): Partial<WallpaperState> {
  if (s.presetId === 'default-dark' && s.mode === 'solid' && s.value === '#0a0a0a') {
    return { ...s, mode: DEFAULTS.mode, value: DEFAULTS.value, presetId: DEFAULTS.presetId };
  }
  return s;
}

export const useWallpaperStore = create<WallpaperState>((set) => {
  const saved = migrateState(loadState());

  // Async load from IPC backend on startup (overrides localStorage)
  (window as any).electron?.invoke?.('capability:storage:get', STORAGE_KEY).then((raw: string | null) => {
    if (raw) {
      try {
        const parsed = migrateState(JSON.parse(raw));
        set({
          mode: parsed.mode ?? DEFAULTS.mode,
          value: parsed.value ?? DEFAULTS.value,
          presetId: parsed.presetId ?? DEFAULTS.presetId,
          blur: parsed.blur ?? DEFAULTS.blur,
          opacity: parsed.opacity ?? DEFAULTS.opacity,
          tint: parsed.tint ?? DEFAULTS.tint,
        });
      } catch { /* ignore parsing error */ }
    }
  }).catch((e: unknown) => { console.warn('[DEX]', e); });

  return {
    mode: saved.mode ?? DEFAULTS.mode,
    value: saved.value ?? DEFAULTS.value,
    presetId: saved.presetId ?? DEFAULTS.presetId,
    blur: saved.blur ?? DEFAULTS.blur,
    opacity: saved.opacity ?? DEFAULTS.opacity,
    tint: saved.tint ?? DEFAULTS.tint,

    setWallpaper: (preset) => {
      set({ mode: preset.mode, value: preset.value, presetId: preset.id });
      saveState({ ...DEFAULTS, mode: preset.mode, value: preset.value, presetId: preset.id });
    },

    setCustomImage: (dataUrl) => {
      // Validate data URL: must start with data:image/ and be under 5 MB
      const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;
      if (
        typeof dataUrl !== 'string' ||
        !dataUrl.startsWith('data:image/') ||
        dataUrl.length > MAX_DATA_URL_BYTES
      ) {
        console.warn('[wallpaperStore] Invalid or oversized custom image rejected');
        return;
      }
      const next = { mode: 'image' as WallpaperMode, value: dataUrl, presetId: 'custom' };
      set(next);
      saveState({ ...DEFAULTS, ...next });
    },

    setBlur: (blur) => {
      set({ blur });
      set((s) => { saveState(s); return {}; });
    },

    setOpacity: (opacity) => {
      set({ opacity });
      set((s) => { saveState(s); return {}; });
    },

    setTint: (tint) => {
      set({ tint });
      set((s) => { saveState(s); return {}; });
    },

    reset: () => {
      set(DEFAULTS);
      saveState(DEFAULTS);
    },
  };
});

export default useWallpaperStore;
