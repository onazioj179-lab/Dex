// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Shell preferences store
// ---------------------------------------------------------------------------
// One Zustand store for all "shell-level" user preferences that we wired up
// in May 2026 — movable taskbar, compact taskbar, Frosted Ice, Night
// Shift, low-end mode, and the "respect-my-update-choice" guard.
//
// Persisted to localStorage under DEX_SHELL_PREFS_KEY and mirrored to the
// main process via the existing capability:storage IPC bridge. Each setter
// applies its side-effect (CSS variables, perf-tier attribute, etc.) so
// callers can flip a pref and the UI updates immediately.
//
// Pure side-effect functions (applyGlassVars, applyNightShift, applyLowEnd)
// are exported so they can be re-applied after hydration without going
// through Zustand actions.

import { create } from 'zustand';
import { normalizeDockEdge, normalizeDockPreset, normalizeDockAlign, type DockEdge, type DockSizePreset, type DockAlign } from '../../shared/shell/dockGeometry';

export const DEX_SHELL_PREFS_KEY = 'dex-shell-preferences-v1';

export type GlassMode = 'off' | 'reduced' | 'normal' | 'liquid';

export interface ShellPreferences {
  /** Edge of the screen the dock attaches to. */
  dockEdge: DockEdge;
  /** Alignment along that edge (start / center / end). */
  dockAlign: DockAlign;
  /** Size preset for dock + icons. */
  dockPreset: DockSizePreset;
  /** Frosted Ice background opacity (0.4–1.0). 1.0 = fully opaque. */
  glassOpacity: number;
  /** Frosted Ice neutral base (legacy tint field retained for persistence). */
  glassTint: string;
  /** Global transparency mode for shell glass surfaces. */
  glassMode: GlassMode;
  /** Night Shift enabled (warmer color filter). */
  nightShift: boolean;
  /** Night Shift intensity 0–1. */
  nightShiftIntensity: number;
  /** Force low-end mode (kills blur, animation, magnification). */
  lowEndMode: boolean;
  /** When true the updater never auto-selects "Install"; defaults to "Later". */
  respectUpdateChoice: boolean;
  /** Keep browser tabs warm in sleep instead of refreshing on resume. */
  preventTabRefreshOnSleep: boolean;
  /** Allow clipboard history to sync across signed-in devices. */
  clipboardCloudSync: boolean;
  /** Show the always-on-top MiniPulse system monitor pill. */
  miniPulseEnabled: boolean;
  /** Automatically recover crashed apps (bounded retries, then crash card). */
  autoRecoverApps: boolean;
}

export const DEFAULT_SHELL_PREFERENCES: ShellPreferences = {
  dockEdge: 'bottom',
  dockAlign: 'center',
  dockPreset: 'regular',
  // Frosted Ice is readable first: high-opacity diffusion, restrained blur.
  glassOpacity: 0.9,
  glassTint: '#0a0a0a',
  glassMode: 'normal',
  nightShift: false,
  nightShiftIntensity: 0.4,
  lowEndMode: false,
  respectUpdateChoice: true,
  preventTabRefreshOnSleep: true,
  clipboardCloudSync: false,
  miniPulseEnabled: false,
  autoRecoverApps: true,
};

interface ShellPreferencesActions {
  setDockEdge: (edge: DockEdge) => void;
  setDockAlign: (align: DockAlign) => void;
  setDockPreset: (preset: DockSizePreset) => void;
  setGlassOpacity: (value: number) => void;
  setGlassTint: (hex: string) => void;
  setGlassMode: (mode: GlassMode) => void;
  setNightShift: (enabled: boolean) => void;
  setNightShiftIntensity: (value: number) => void;
  setLowEndMode: (enabled: boolean) => void;
  setRespectUpdateChoice: (enabled: boolean) => void;
  setPreventTabRefreshOnSleep: (enabled: boolean) => void;
  setClipboardCloudSync: (enabled: boolean) => void;
  setMiniPulseEnabled: (enabled: boolean) => void;
  setAutoRecoverApps: (enabled: boolean) => void;
  reset: () => void;
}

export type ShellPreferencesStore = ShellPreferences & ShellPreferencesActions;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadInitial(): ShellPreferences {
  try {
    const raw = typeof localStorage !== 'undefined'
      ? localStorage.getItem(DEX_SHELL_PREFS_KEY)
      : null;
    if (!raw) return { ...DEFAULT_SHELL_PREFERENCES };
    const parsed = JSON.parse(raw);
    return mergePrefs(parsed);
  } catch {
    return { ...DEFAULT_SHELL_PREFERENCES };
  }
}

export function mergePrefs(input: unknown): ShellPreferences {
  const base = { ...DEFAULT_SHELL_PREFERENCES };
  if (!input || typeof input !== 'object') return base;
  const o = input as Record<string, unknown>;
  base.dockEdge = normalizeDockEdge(o.dockEdge);
  base.dockAlign = normalizeDockAlign(o.dockAlign);
  base.dockPreset = normalizeDockPreset(o.dockPreset);
  base.glassOpacity = clamp01(o.glassOpacity, base.glassOpacity, 0.4, 1);
  base.glassTint = typeof o.glassTint === 'string' && /^#[0-9a-f]{6}$/i.test(o.glassTint)
    ? o.glassTint
    : base.glassTint;
  // Legacy `liquid` values migrate to the canonical Frosted Ice mode.
  base.glassMode = o.glassMode === 'off' || o.glassMode === 'reduced'
    ? o.glassMode
    : 'normal';
  base.nightShift = o.nightShift === true;
  base.nightShiftIntensity = clamp01(o.nightShiftIntensity, base.nightShiftIntensity, 0, 1);
  base.lowEndMode = o.lowEndMode === true;
  base.respectUpdateChoice = o.respectUpdateChoice !== false; // default true
  base.preventTabRefreshOnSleep = o.preventTabRefreshOnSleep !== false;
  base.clipboardCloudSync = o.clipboardCloudSync === true;
  base.miniPulseEnabled = o.miniPulseEnabled === true;
  base.autoRecoverApps = o.autoRecoverApps !== false; // default true
  return base;
}

function clamp01(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function persist(prefs: ShellPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEX_SHELL_PREFS_KEY, JSON.stringify(prefs));
    }
    const electron = (typeof window !== 'undefined' ? (window as any).electron : null) || null;
    electron?.invoke?.('capability:storage:set', DEX_SHELL_PREFS_KEY, JSON.stringify(prefs))
      .catch((e: unknown) => { console.warn('[DEX shell prefs]', e); });
  } catch {
    /* quota or sandbox — fine */
  }
}

// ---------------------------------------------------------------------------
// Side-effect appliers (exported for explicit re-apply after hydration)
// ---------------------------------------------------------------------------

export function getEffectiveGlassMode(prefs: Pick<ShellPreferences, 'glassMode' | 'lowEndMode'>): GlassMode {
  if (prefs.lowEndMode) return 'reduced';
  if (typeof window !== 'undefined') {
    try {
      // OS-level accessibility hint: prefers-reduced-transparency is the
      // canonical signal; prefers-reduced-motion is a reasonable fallback for
      // browsers that do not yet expose the transparency query.
      const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if ((reducedTransparency || reducedMotion) && prefs.glassMode !== 'off') {
        return 'reduced';
      }
    } catch {
      // no-op (older WebViews / sandboxed contexts)
    }
  }
  return prefs.glassMode;
}

export function applyGlassVars(prefs: Pick<ShellPreferences, 'glassOpacity' | 'glassTint' | 'glassMode' | 'lowEndMode'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effectiveMode = getEffectiveGlassMode({ glassMode: prefs.glassMode, lowEndMode: prefs.lowEndMode });
  const requestedOpacity = Math.max(0.4, Math.min(1, prefs.glassOpacity));
  root.style.setProperty('--dex-glass-opacity', String(requestedOpacity));
  root.style.setProperty('--dex-glass-mode', prefs.glassMode);
  root.style.setProperty('--dex-glass-effective-mode', effectiveMode);
  root.setAttribute('data-glass-mode', prefs.glassMode);
  root.setAttribute('data-glass-effective-mode', effectiveMode);
  const { r, g, b } = hexToRgb(prefs.glassTint) ?? { r: 10, g: 10, b: 10 };
  root.style.setProperty('--dex-glass-tint-r', String(r));
  root.style.setProperty('--dex-glass-tint-g', String(g));
  root.style.setProperty('--dex-glass-tint-b', String(b));

  // Frosted Ice is computed from the user's material prefs and written here as
  // inline CSS vars, so this is
  // the single runtime control point for every `--color-bg-glass(-strong)`
  // consumer (menus, dropdowns, sidebars, toolbars, panels, the floating
  // chrome). Paired with the adaptive backdrop blur in styles/glassMenu.ts.
  //   off      -> fully solid, theme-aware (no see-through, no blur)
  //   reduced  -> near-opaque, no blur (accessibility / weak GPU)
  //   normal   -> high-opacity fill + restrained 14px diffusion
  const tint = `${r}, ${g}, ${b}`;
  if (effectiveMode === 'off') {
    // Glass FULLY OFF (owner direction): every glass surface -- menus, panels,
    // sidebars, toolbars, and the floating chrome (top bar, dock, orbs,
    // spotlight, app menu) -- goes opaque TRUE BLACK, no blur. Pure #000 AMOLED.
    root.style.setProperty('--dex-glass-bg', '#000000');
    root.style.setProperty('--color-bg-glass', '#000000');
    root.style.setProperty('--color-bg-glass-strong', '#000000');
    root.style.setProperty('--dex-glass-blur', '0px');
    root.style.setProperty('--glass-bg', '#000000');
    root.style.setProperty('--glass-blur', 'none');
  } else if (effectiveMode === 'reduced') {
    const op = Math.max(requestedOpacity, 0.92);
    root.style.setProperty('--dex-glass-bg', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass-strong', `rgba(${tint}, ${Math.min(op + 0.05, 1)})`);
    root.style.setProperty('--dex-glass-blur', '0px');
    root.style.setProperty('--glass-bg', `rgba(${tint}, ${op})`);
    root.style.setProperty('--glass-blur', 'none');
  } else {
    const op = Math.max(requestedOpacity, 0.86);
    const filter = 'blur(14px) saturate(100%)';
    root.style.setProperty('--dex-glass-bg', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass-strong', `rgba(${tint}, ${Math.min(op + 0.12, 1)})`);
    root.style.setProperty('--dex-glass-blur', filter);
    // Floating chrome remains slightly lighter than content panels while
    // preserving strong text contrast.
    root.style.setProperty('--glass-bg', `rgba(${tint}, ${Math.max(op - 0.04, 0.82)})`);
    root.style.setProperty('--glass-blur', filter);
  }
}

export function applyNightShift(prefs: Pick<ShellPreferences, 'nightShift' | 'nightShiftIntensity'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!prefs.nightShift) {
    root.style.removeProperty('--dex-night-shift-filter');
    root.removeAttribute('data-night-shift');
    return;
  }
  const intensity = Math.max(0, Math.min(1, prefs.nightShiftIntensity));
  // Sepia + slight hue rotate produces a warm filter without blowing out blacks.
  const filter = `sepia(${(intensity * 0.45).toFixed(2)}) saturate(${(1 - intensity * 0.2).toFixed(2)}) hue-rotate(-${Math.round(intensity * 12)}deg)`;
  root.style.setProperty('--dex-night-shift-filter', filter);
  root.setAttribute('data-night-shift', 'on');
}

export function applyLowEndMode(prefs: Pick<ShellPreferences, 'lowEndMode'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (prefs.lowEndMode) {
    // Low-end mode is now isolated from device perf-tier. Forcing the tier to
    // "low" caused surprise fallback to flat "boxy black" visuals after long
    // sessions when prefs were re-applied.
    root.setAttribute('data-low-end-mode', 'on');
  } else {
    root.removeAttribute('data-low-end-mode');
  }
}

import { hexToRgb } from '../../shared/creative/colorUtils';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useShellPreferences = create<ShellPreferencesStore>((set, get) => {
  const initial = loadInitial();
  // Apply effects synchronously on first load so the UI never "flashes" with
  // defaults before user prefs land.
  applyGlassVars(initial);
  applyNightShift(initial);
  applyLowEndMode(initial);

  // Re-apply glass vars when the user's reduced-motion / reduced-transparency
  // preference changes at the OS level. This keeps the effective glass mode
  // honest without requiring a reload.
  // Guarded so a store re-create (HMR / repeat import) can't stack duplicate
  // matchMedia 'change' listeners that each re-run applyGlassVars.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && !(window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired) {
    (window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired = true;
    try {
      const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const mqTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
      const handler = () => {
        try { applyGlassVars(get()); } catch { /* noop */ }
      };
      mqMotion.addEventListener?.('change', handler);
      mqTransparency.addEventListener?.('change', handler);
    } catch { /* noop */ }
  }

  // Late-hydrate from main-process storage in case localStorage was wiped but
  // the IPC mirror still has the prefs.
  if (typeof window !== 'undefined') {
    (window as any).electron?.invoke?.('capability:storage:get', DEX_SHELL_PREFS_KEY)
      .then((stored: string | null) => {
        if (!stored) return;
        try {
          const merged = mergePrefs(JSON.parse(stored));
          if (JSON.stringify(merged) === JSON.stringify(get())) return;
          set(merged);
          applyGlassVars(merged);
          applyNightShift(merged);
          applyLowEndMode(merged);
        } catch { /* ignore */ }
      })
      .catch(() => { /* main process unavailable */ });
  }

  function update(partial: Partial<ShellPreferences>): void {
    const next = { ...get(), ...partial };
    set(partial);
    persist(next);
  }

  return {
    ...initial,

    setDockEdge: (edge) => update({ dockEdge: normalizeDockEdge(edge) }),
    setDockAlign: (align) => update({ dockAlign: normalizeDockAlign(align) }),
    setDockPreset: (preset) => update({ dockPreset: normalizeDockPreset(preset) }),

    setGlassOpacity: (value) => {
      const v = clamp01(value, 0.85, 0.4, 1);
      update({ glassOpacity: v });
      applyGlassVars({ ...get(), glassOpacity: v });
    },
    setGlassTint: (hex) => {
      const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_SHELL_PREFERENCES.glassTint;
      update({ glassTint: safe });
      applyGlassVars({ ...get(), glassTint: safe });
    },
    setGlassMode: (mode) => {
      const safe: GlassMode = mode === 'off' || mode === 'reduced' ? mode : 'normal';
      update({ glassMode: safe });
      applyGlassVars({ ...get(), glassMode: safe });
    },

    setNightShift: (enabled) => {
      update({ nightShift: enabled });
      applyNightShift({ ...get(), nightShift: enabled });
    },
    setNightShiftIntensity: (value) => {
      const v = clamp01(value, 0.4, 0, 1);
      update({ nightShiftIntensity: v });
      applyNightShift({ ...get(), nightShiftIntensity: v });
    },

    setLowEndMode: (enabled) => {
      update({ lowEndMode: enabled });
      applyLowEndMode({ lowEndMode: enabled });
    },

    setRespectUpdateChoice: (enabled) => update({ respectUpdateChoice: enabled }),
    setPreventTabRefreshOnSleep: (enabled) => update({ preventTabRefreshOnSleep: enabled }),
    setClipboardCloudSync: (enabled) => update({ clipboardCloudSync: enabled }),
    setMiniPulseEnabled: (enabled) => update({ miniPulseEnabled: enabled }),
    setAutoRecoverApps: (enabled) => update({ autoRecoverApps: enabled }),

    reset: () => {
      const next = { ...DEFAULT_SHELL_PREFERENCES };
      set(next);
      persist(next);
      applyGlassVars(next);
      applyNightShift(next);
      applyLowEndMode(next);
    },
  };
});
