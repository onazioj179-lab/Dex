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

export const GLASS_BLUR_MIN = 4;
export const GLASS_BLUR_MAX = 40;
/** Lowest surface opacity the slider can reach (100% transparency setting). */
const GLASS_OPACITY_FLOOR = 0.4;

/**
 * "Interface Transparency" is one 0-100 control layered over the two stored
 * material parameters (mode + opacity). 0 = fully opaque (no blur, cheapest);
 * 100 = the most translucent supported glass. Blur strength is a separate
 * parameter and is NOT derived from this value.
 */
export function transparencyToPrefs(percent: number): Pick<ShellPreferences, 'glassMode' | 'glassOpacity'> {
  const t = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  if (t === 0) return { glassMode: 'off', glassOpacity: 1 };
  const opacity = 1 - (t / 100) * (1 - GLASS_OPACITY_FLOOR);
  return { glassMode: t >= 75 ? 'liquid' : 'normal', glassOpacity: Math.round(opacity * 1000) / 1000 };
}

export function prefsToTransparency(prefs: Pick<ShellPreferences, 'glassMode' | 'glassOpacity'>): number {
  if (prefs.glassMode === 'off') return 0;
  const t = ((1 - prefs.glassOpacity) / (1 - GLASS_OPACITY_FLOOR)) * 100;
  return Math.max(1, Math.min(100, Math.round(t)));
}

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
  /** Global transparency mode for shell glass surfaces. */
  glassMode: GlassMode;
  /** Backdrop blur strength in px (4-40). Independent of opacity. */
  glassBlur: number;
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
  glassBlur: 24,
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
  setGlassBlur: (px: number) => void;
  /** Single 0-100 "Interface Transparency" control (0 = opaque, 100 = max glass). */
  setInterfaceTransparency: (percent: number) => void;
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
        if (merged.glassMode !== 'off') { merged.glassMode = 'off'; merged.glassOpacity = 1; }
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
  base.glassBlur = clamp01(o.glassBlur, base.glassBlur, GLASS_BLUR_MIN, GLASS_BLUR_MAX);
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
      // OS-level accessibility hint. Only prefers-reduced-transparency counts:
      // reduced *motion* says nothing about translucency, and treating it as
      // such silently disabled the Interface Transparency slider for anyone
      // with Reduce Motion on.
      if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches && prefs.glassMode !== 'off') {
        return 'reduced';
      }
    } catch {
      // no-op (older WebViews / sandboxed contexts)
    }
  }
  return prefs.glassMode;
}

export function applyGlassVars(prefs: Pick<ShellPreferences, 'glassOpacity' | 'glassTint' | 'glassMode' | 'lowEndMode'> & { glassBlur?: number }): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effectiveMode = getEffectiveGlassMode({ glassMode: prefs.glassMode, lowEndMode: prefs.lowEndMode });
  const requestedOpacity = Math.max(0.4, Math.min(1, prefs.glassOpacity));
  root.style.setProperty('--dex-glass-opacity', String(requestedOpacity));
  root.style.setProperty('--dex-glass-mode', prefs.glassMode);
  root.style.setProperty('--dex-glass-effective-mode', effectiveMode);
  root.setAttribute('data-glass-mode', prefs.glassMode);
  root.setAttribute('data-glass-effective-mode', effectiveMode);
  // Inline root vars outrank the [data-theme] stylesheet rules, so the solid /
  // translucent values below must follow the active theme or light mode would
  // get dark panels. Re-applied on every data-theme change (see store init).
  const light = root.getAttribute('data-theme') === 'light';
  const userTint = hexToRgb(prefs.glassTint) ?? { r: 10, g: 10, b: 10 };
  const defaultTint = prefs.glassTint.toLowerCase() === DEFAULT_SHELL_PREFERENCES.glassTint;
  const { r, g, b } = light && defaultTint ? { r: 245, g: 245, b: 247 } : userTint;
  const solid = light
    ? { chrome: '#F5F5F8', glass: '#F5F5F8', strong: '#F0F0F3' }
    : { chrome: '#141416', glass: '#161618', strong: '#1a1a1e' };
  root.style.setProperty('--dex-glass-tint-r', String(r));
  root.style.setProperty('--dex-glass-tint-g', String(g));
  root.style.setProperty('--dex-glass-tint-b', String(b));

  // Liquid glass (master overhaul): the shell's frosted material is computed
  // from the user's glass prefs and written here as inline CSS vars, so this is
  // the single runtime control point for every `--color-bg-glass(-strong)`
  // consumer (menus, dropdowns, sidebars, toolbars, panels, the floating
  // chrome). Paired with the adaptive backdrop blur in styles/glassMenu.ts.
  //   off      -> fully solid, theme-aware (no see-through, no blur)
  //   reduced  -> near-opaque, no blur (accessibility / weak GPU)
  //   normal   -> translucent fill + 24px frosted blur
  //   liquid   -> lighter fill floor + 32px blur with extra saturation
  const tint = `${r}, ${g}, ${b}`;
  if (effectiveMode === 'off') {
    // Glass OFF = "frosted ice fill" (owner direction, 2026-07): every glass
    // surface -- menus, panels, sidebars, toolbars, and the floating chrome (top
    // bar, dock, spotlight, app menu) -- is a SOLID, opaque, matte frosted fill
    // (no see-through, no blur). Not pure #000 void: these sit a step ABOVE the
    // near-black desktop so surfaces read as lifted frosted panels, using the
    // design's own canonical solid values (same as the reduced-transparency
    // fallback). Consistent "frost fill everywhere" without any glass/blur.
    root.style.setProperty('--dex-glass-bg', solid.chrome);
    root.style.setProperty('--color-bg-glass', solid.glass);
    root.style.setProperty('--color-bg-glass-strong', solid.strong);
    root.style.setProperty('--dex-glass-blur', '0px');
    root.style.setProperty('--glass-bg', solid.chrome);
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
    const liquid = effectiveMode === 'liquid';
    // 'liquid' floats a touch more transparent so the wallpaper lensing reads.
    const op = requestedOpacity;
    // Blur strength is its own parameter; 'liquid' adds a little extra depth.
    const baseBlur = clamp01(prefs.glassBlur, DEFAULT_SHELL_PREFERENCES.glassBlur, GLASS_BLUR_MIN, GLASS_BLUR_MAX);
    const blur = Math.min(GLASS_BLUR_MAX, baseBlur + (liquid ? 8 : 0));
    const sat = liquid ? 200 : 180;
    const filter = `blur(${blur}px) saturate(${sat}%)`;
    root.style.setProperty('--dex-glass-bg', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass', `rgba(${tint}, ${op})`);
    root.style.setProperty('--color-bg-glass-strong', `rgba(${tint}, ${Math.min(op + 0.12, 1)})`);
    root.style.setProperty('--dex-glass-blur', filter);
    // Floating chrome floats a touch more transparent than panels for the
    // classic translucent top-bar / dock look.
    root.style.setProperty('--glass-bg', `rgba(${tint}, ${Math.max(op - 0.08, 0.5)})`);
    root.style.setProperty('--glass-blur', filter);
  }

  // Unified glass authority: when glass is off/reduced (or low-end / OS
  // reduced-transparency mapped to those), flip the platform-wide opt-out so
  // EVERY glass surface — the runtime-driven chrome AND the ~50 tokenized
  // `var(--blur-*)` consumers — flattens together. This makes Settings › Liquid
  // Glass the single authority over the whole app's blur, not just the chrome
  // fill tokens. When glass is on, clear the overrides so the canonical
  // design-system.css blur ladder (and the tier gates) apply.
  if (effectiveMode === 'off' || effectiveMode === 'reduced') {
    root.setAttribute('data-no-blur', 'true');
    root.style.setProperty('--blur-sm', 'blur(0px)');
    root.style.setProperty('--blur-md', 'blur(0px)');
    root.style.setProperty('--blur-lg', 'blur(0px)');
    root.style.setProperty('--blur-xl', 'blur(0px)');
  } else {
    root.removeAttribute('data-no-blur');
    root.style.removeProperty('--blur-sm');
    root.style.removeProperty('--blur-md');
    root.style.removeProperty('--blur-lg');
    root.style.removeProperty('--blur-xl');
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
  // Theme switches (light <-> dark) must re-resolve the inline material vars,
  // otherwise the previous theme's solid/tint values keep winning over the
  // stylesheet. Guarded like the matchMedia listeners below.
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined'
      && !(window as { __dexGlassThemeWired?: boolean }).__dexGlassThemeWired) {
    (window as { __dexGlassThemeWired?: boolean }).__dexGlassThemeWired = true;
    let lastTheme = document.documentElement.getAttribute('data-theme');
    new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme');
      if (t === lastTheme) return;
      lastTheme = t;
      try { applyGlassVars(get()); } catch { /* noop */ }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && !(window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired) {
    (window as { __dexGlassMqWired?: boolean }).__dexGlassMqWired = true;
    try {
      const mqTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
      const handler = () => {
        try { applyGlassVars(get()); } catch { /* noop */ }
      };
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
      const safe: GlassMode = mode === 'off' || mode === 'reduced' || mode === 'liquid' ? mode : 'normal';
      update({ glassMode: safe });
      applyGlassVars({ ...get(), glassMode: safe });
    },

    setGlassBlur: (px) => {
      const v = clamp01(px, DEFAULT_SHELL_PREFERENCES.glassBlur, GLASS_BLUR_MIN, GLASS_BLUR_MAX);
      update({ glassBlur: v });
      applyGlassVars({ ...get(), glassBlur: v });
    },
    setInterfaceTransparency: (percent) => {
      const next = transparencyToPrefs(percent);
      update(next);
      applyGlassVars({ ...get(), ...next });
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
