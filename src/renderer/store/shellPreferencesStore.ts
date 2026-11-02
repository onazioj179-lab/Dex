// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Shell preferences store
// ---------------------------------------------------------------------------
// One Zustand store for all "shell-level" user preferences that we wired up
// in May 2026 — movable taskbar, compact taskbar, Liquid-Glass tint, Night
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
// One-time migration marker: the OS moved to a consistent non-glass look, so any
// install that still has a translucent glass mode persisted is flipped to 'off'
// exactly once. Presence of this key means the migration already ran.
const GLASS_REMOVED_FLAG = 'dex-glass-removed-v1';

export type GlassMode = 'off' | 'reduced' | 'normal' | 'liquid';

export interface ShellPreferences {
  /** Edge of the screen the dock attaches to. */
  dockEdge: DockEdge;
  /** Alignment along that edge (start / center / end). */
  dockAlign: DockAlign;
  /** Size preset for dock + icons. */
  dockPreset: DockSizePreset;
  /** Liquid-Glass background opacity (0.4–1.0). 1.0 = fully opaque. */
  glassOpacity: number;
  /** Liquid-Glass tint hex (e.g. "#0a0a0a"). Mixed into surfaces. */
  glassTint: string;
  /** Global transparency mode for shell glass surfaces. Derived from
   *  interfaceTransparency (0 -> 'off', otherwise 'normal'); kept for callers
   *  that still read the mode. */
  glassMode: GlassMode;
  /** Interface Transparency, 0 (fully opaque) to 100 (maximum glass). The
   *  single user control for shell material: drives surface opacity and,
   *  separately, backdrop blur strength. */
  interfaceTransparency: number;
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
  // No glass out of the box (owner direction, 2026-07): the WHOLE OS reads as one
  // consistent, solid, non-translucent surface — every menu, panel, dropdown,
  // sidebar, and the floating chrome (DEX Bar). 'off' makes applyGlassVars() emit
  // fully-opaque true-black surfaces with zero blur. The Settings toggle can still
  // opt back into translucent glass for anyone who wants it.
  glassOpacity: 1,
  glassTint: '#0a0a0a',
  glassMode: 'off',
  interfaceTransparency: 0,
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
  setInterfaceTransparency: (value: number) => void;
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
    const merged = mergePrefs(parsed);
    // One-time glass-removal migration: flip a previously-saved translucent glass
    // mode to solid ONCE so existing installs match the new consistent default.
    // The Settings toggle still works afterwards for deliberate re-enable.
    try {
      if (localStorage.getItem(GLASS_REMOVED_FLAG) !== '1') {
        if (merged.glassMode !== 'off') { merged.glassMode = 'off'; merged.glassOpacity = 1; merged.interfaceTransparency = 0; }
        localStorage.setItem(GLASS_REMOVED_FLAG, '1');
        persist(merged);
      }
    } catch { /* quota / sandbox — the new default already lands 'off' */ }
    return merged;
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
  base.glassMode = o.glassMode === 'off' || o.glassMode === 'reduced' || o.glassMode === 'liquid'
    ? o.glassMode
    : 'normal';
  // Older installs saved only a mode; map it onto the slider.
  base.interfaceTransparency = typeof o.interfaceTransparency === 'number' && Number.isFinite(o.interfaceTransparency)
    ? clampTransparency(o.interfaceTransparency)
    : transparencyForMode(base.glassMode);
  base.glassMode = modeForTransparency(base.interfaceTransparency);
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

const MODE_TRANSPARENCY: Record<GlassMode, number> = { off: 0, reduced: 25, normal: 60, liquid: 100 };

export function transparencyForMode(mode: GlassMode): number {
  return MODE_TRANSPARENCY[mode] ?? 0;
}

export function modeForTransparency(value: number): GlassMode {
  return value <= 0 ? 'off' : 'normal';
}

function clampTransparency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Surface material for a transparency level. Opacity and blur are separate
 *  parameters: opacity falls linearly to 55% at 100 so text stays readable,
 *  blur rises from 6px to 32px. Without GPU blur (low perf tier) the surface
 *  stays at least 88% opaque because there is no frost to keep text legible. */
export interface InterfaceMaterial {
  /** Panel fill opacity, percent. */
  panel: number;
  /** Content-heavy panels, percent. */
  strong: number;
  /** Floating chrome (top bar, dock, DEX Bar), percent. */
  chrome: number;
  /** Backdrop blur radius in px (0 = no blur). */
  blur: number;
  /** Backdrop saturation, percent. */
  saturate: number;
}

export function computeInterfaceMaterial(transparency: number, gpuBlur = true): InterfaceMaterial {
  const t = clampTransparency(transparency) / 100;
  if (t === 0) return { panel: 100, strong: 100, chrome: 100, blur: 0, saturate: 100 };
  let panel = Math.round(100 - 45 * t);
  const blur = gpuBlur ? Math.round(6 + 26 * t) : 0;
  if (!gpuBlur) panel = Math.max(panel, 88);
  return {
    panel,
    strong: Math.min(100, panel + 12),
    chrome: Math.max(gpuBlur ? 42 : 86, panel - 8),
    blur,
    saturate: blur ? Math.round(100 + 80 * t) : 100,
  };
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
  if (prefs.glassMode === 'off') return 'off';
  if (prefs.lowEndMode) return 'reduced';
  if (typeof window !== 'undefined') {
    try {
      // Only the transparency preference gates glass. Reduced MOTION used to
      // count too, which silently disabled the slider on every PC with
      // Windows' "Animation effects" turned off.
      const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
      if (reducedTransparency) return 'reduced';
      // High-contrast material and Settings > Reduce Transparency: opaque
      // surfaces, nothing showing through.
      const root = document.documentElement;
      if (root.classList.contains('high-contrast')
        || root.getAttribute('data-high-contrast') === 'true'
        || root.getAttribute('data-reduce-transparency') === 'true') return 'reduced';
    } catch {
      // no-op (older WebViews / sandboxed contexts)
    }
  }
  return prefs.glassMode;
}

function gpuBlurAvailable(): boolean {
  if (typeof document === 'undefined') return true;
  const root = document.documentElement;
  return root.getAttribute('data-perf-tier') !== 'low' && !root.classList.contains('dex-no-blur');
}

export function applyGlassVars(prefs: Pick<ShellPreferences, 'glassOpacity' | 'glassTint' | 'glassMode' | 'lowEndMode'> & { interfaceTransparency?: number }): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const transparency = typeof prefs.interfaceTransparency === 'number'
    ? clampTransparency(prefs.interfaceTransparency)
    : transparencyForMode(prefs.glassMode);
  const glassMode = modeForTransparency(transparency);
  const effectiveMode = getEffectiveGlassMode({ glassMode, lowEndMode: prefs.lowEndMode });
  const material = computeInterfaceMaterial(effectiveMode === 'normal' ? transparency : 0, gpuBlurAvailable());
  root.style.setProperty('--dex-glass-opacity', String(material.panel / 100));
  root.style.setProperty('--dex-glass-mode', glassMode);
  root.style.setProperty('--dex-glass-effective-mode', effectiveMode);
  root.style.setProperty('--dex-material-opacity', String(material.panel / 100));
  root.style.setProperty('--dex-material-blur', `${material.blur}px`);
  root.setAttribute('data-glass-mode', glassMode);
  root.setAttribute('data-glass-effective-mode', effectiveMode);
  root.setAttribute('data-interface-transparency', String(transparency));

  // Single runtime control point for every `--color-bg-glass(-strong)` /
  // `--glass-bg` consumer (menus, dropdowns, sidebars, toolbars, panels, top
  // bar, dock, DEX Bar). Fills are theme tokens mixed with transparency, so the
  // same slider position reads correctly in light and dark mode: these inline
  // vars beat the [data-theme] stylesheet, which is why hard-coded tints kept
  // the shell dark in light mode.
  //   off / reduced (slider at 0, OS reduced transparency, low-end mode)
  //     -> fully opaque theme surfaces, no blur
  //   normal -> theme surfaces at the slider's opacity + proportional blur
  if (effectiveMode !== 'normal') {
    root.style.setProperty('--dex-glass-bg', 'var(--color-bg-overlay)');
    root.style.setProperty('--color-bg-glass', 'var(--color-bg-secondary)');
    root.style.setProperty('--color-bg-glass-strong', 'var(--color-bg-surface)');
    root.style.setProperty('--dex-glass-blur', '0px');
    root.style.setProperty('--glass-bg', 'var(--color-bg-overlay)');
    root.style.setProperty('--glass-blur', 'none');
  } else {
    const mix = (token: string, pct: number) => pct >= 100
      ? `var(${token})`
      : `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
    const filter = material.blur > 0 ? `blur(${material.blur}px) saturate(${material.saturate}%)` : 'none';
    root.style.setProperty('--dex-glass-bg', mix('--color-bg-overlay', material.panel));
    root.style.setProperty('--color-bg-glass', mix('--color-bg-secondary', material.panel));
    root.style.setProperty('--color-bg-glass-strong', mix('--color-bg-surface', material.strong));
    root.style.setProperty('--dex-glass-blur', material.blur > 0 ? filter : '0px');
    root.style.setProperty('--glass-bg', mix('--color-bg-overlay', material.chrome));
    root.style.setProperty('--glass-blur', filter);
  }

  // Blur authority: at 0 / reduced every backdrop blur in the app is removed
  // (cheapest path, nothing to see through). Otherwise the shared blur ladder
  // scales with the slider so the ~50 tokenized `var(--blur-*)` consumers
  // follow the same setting as the chrome.
  if (material.blur === 0) {
    root.setAttribute('data-no-blur', 'true');
    root.style.setProperty('--blur-sm', 'blur(0px)');
    root.style.setProperty('--blur-md', 'blur(0px)');
    root.style.setProperty('--blur-lg', 'blur(0px)');
    root.style.setProperty('--blur-xl', 'blur(0px)');
  } else {
    const scale = material.blur / 32;
    root.removeAttribute('data-no-blur');
    root.style.setProperty('--blur-sm', `blur(${Math.round(8 * scale)}px)`);
    root.style.setProperty('--blur-md', `blur(${Math.round(16 * scale)}px)`);
    root.style.setProperty('--blur-lg', `blur(${Math.round(24 * scale)}px)`);
    root.style.setProperty('--blur-xl', `blur(${Math.round(32 * scale)}px)`);
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

  // Re-apply glass vars when the user's reduced-transparency
  // preference changes at the OS level. This keeps the effective glass mode
  // honest without requiring a reload.
  // Guarded so a store re-create (HMR / repeat import) can't stack duplicate
  // matchMedia 'change' listeners that each re-run applyGlassVars.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && !(window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired) {
    (window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired = true;
    try {
      const mqTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
      const handler = () => {
        try { applyGlassVars(get()); } catch { /* noop */ }
      };
      mqTransparency.addEventListener?.('change', handler);
      // The perf tier can drop at runtime (thermal / slow GPU). Inline vars
      // beat the stylesheet's low-tier rule, so recompute the material here.
      if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(handler).observe(document.documentElement, {
          attributes: true, attributeFilter: ['data-perf-tier', 'class'],
        });
      }
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
      const safe: GlassMode = mode === 'off' || mode === 'reduced' || mode === 'liquid' ? mode : 'normal';
      const interfaceTransparency = transparencyForMode(safe);
      const glassMode = modeForTransparency(interfaceTransparency);
      update({ glassMode, interfaceTransparency });
      applyGlassVars({ ...get(), glassMode, interfaceTransparency });
    },
    setInterfaceTransparency: (value) => {
      const interfaceTransparency = clampTransparency(value);
      const glassMode = modeForTransparency(interfaceTransparency);
      update({ glassMode, interfaceTransparency });
      applyGlassVars({ ...get(), glassMode, interfaceTransparency });
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
