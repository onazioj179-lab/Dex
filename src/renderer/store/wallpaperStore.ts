/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX Wallpaper Store
 * Manages desktop wallpaper state – background images, gradients, blur,
 * opacity, and built-in presets.  Persists to localStorage.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WallpaperMode = 'gradient' | 'image' | 'solid';

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
  blur: number;           // px  – applied on top of wallpaper
  opacity: number;        // 0-1 – glass overlay opacity
  tint: string;           // rgba overlay tint

  // Actions
  setWallpaper: (preset: WallpaperPreset) => void;
  setCustomImage: (dataUrl: string) => void;
  setBlur: (blur: number) => void;
  setOpacity: (opacity: number) => void;
  setTint: (tint: string) => void;
  reset: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN PRESETS (macOS Tahoe inspired)
// ═══════════════════════════════════════════════════════════════════════════

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'default-dark',
    name: 'Glass Black',
    mode: 'solid',
    value: '#0a0a0a',
    thumbnail: '#0a0a0a',
  },
  {
    id: 'tahoe-dusk',
    name: 'Tahoe Dusk',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    thumbnail: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 30%, #2d6b6b 60%, #1a3a5c 100%)',
    thumbnail: 'linear-gradient(135deg, #0a1628, #2d6b6b)',
  },
  {
    id: 'cosmic-purple',
    name: 'Cosmic Purple',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #1a0a2e 0%, #3d1a78 40%, #6b21a8 70%, #1a0a2e 100%)',
    thumbnail: 'linear-gradient(135deg, #1a0a2e, #6b21a8)',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #020024 0%, #090979 50%, #0d47a1 100%)',
    thumbnail: 'linear-gradient(135deg, #020024, #0d47a1)',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0c1220 0%, #0a3d62 40%, #1e8449 80%, #0c1220 100%)',
    thumbnail: 'linear-gradient(135deg, #0a3d62, #1e8449)',
  },
  {
    id: 'ember',
    name: 'Ember',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #1a0000 0%, #4a1212 40%, #8b2500 70%, #1a0000 100%)',
    thumbnail: 'linear-gradient(135deg, #1a0000, #8b2500)',
  },
  {
    id: 'sequoia-green',
    name: 'Sequoia',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0a1a0a 0%, #1a3c1a 40%, #2d5a27 70%, #0a1a0a 100%)',
    thumbnail: 'linear-gradient(135deg, #0a1a0a, #2d5a27)',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #1a1000 0%, #3d2800 30%, #6b4400 60%, #1a1000 100%)',
    thumbnail: 'linear-gradient(135deg, #1a1000, #6b4400)',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #1a0a14 0%, #4a1a3d 40%, #8b3a6b 70%, #1a0a14 100%)',
    thumbnail: 'linear-gradient(135deg, #1a0a14, #8b3a6b)',
  },
  {
    id: 'slate',
    name: 'Slate',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0f1114 0%, #1e2328 40%, #2d3436 70%, #0f1114 100%)',
    thumbnail: 'linear-gradient(135deg, #0f1114, #2d3436)',
  },
  {
    id: 'northern-lights',
    name: 'Northern Lights',
    mode: 'gradient',
    value: 'linear-gradient(135deg, #0a0a1a 0%, #1a3a4a 25%, #2d6b3d 50%, #4a3a6b 75%, #0a0a1a 100%)',
    thumbnail: 'linear-gradient(135deg, #1a3a4a, #2d6b3d, #4a3a6b)',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: s.mode,
      value: s.value,
      presetId: s.presetId,
      blur: s.blur,
      opacity: s.opacity,
      tint: s.tint,
    }));
  } catch { /* */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULTS = {
  mode: 'solid' as WallpaperMode,
  value: '#0a0a0a',
  presetId: 'default-dark',
  blur: 0,
  opacity: 0.85,
  tint: 'rgba(0,0,0,0.4)',
};

// ═══════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════

export const useWallpaperStore = create<WallpaperState>((set) => {
  const saved = loadState();
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
