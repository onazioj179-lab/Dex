// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { withViewTransition } from './viewTransition';

export const T = {
  bg:       'var(--color-bg-base)',
  surface:  'var(--color-bg-surface)',
  inset:    'var(--color-bg-inset)',
  hover:    'var(--color-bg-hover)',
  active:   'var(--color-bg-active)',
  overlay:  'var(--color-bg-overlay)',
  glass:    'var(--color-bg-glass)',
  elevated: 'var(--color-bg-elevated)',
  text1:    'var(--color-text-primary)',
  text2:    'var(--color-text-secondary)',
  text3:    'var(--color-text-tertiary)',
  muted:    'var(--color-text-muted)',
  disabled: 'var(--color-text-disabled)',
  accent:   'var(--color-accent)',
  accentHover: 'var(--color-accent-hover)',
  accentLight: 'var(--color-accent-light)',
  success:  'var(--color-success)',
  warning:  'var(--color-warning)',
  error:    'var(--color-error)',
  border:   'var(--color-border)',
  borderSub:'var(--color-border-subtle)',
} as const;

/**
 * Run a theme change with CSS transitions switched off for that one style
 * pass. Without this, flipping light/dark started a colour transition on every
 * element that declares one (thousands with a few apps open): measured in the
 * packaged app with 7 apps, 2.2 s of style recalculation per switch, 125 ms
 * with transitions suppressed. The suppressing <style> exists only for the
 * flush, so it costs nothing at any other time.
 */
export function withoutTransitions(change: () => void): void {
  if (typeof document === 'undefined') { change(); return; }
  const style = document.createElement('style');
  style.setAttribute('data-dex-theme-switch', '');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  try {
    change();
    // Flush styles while transitions are off, so none start for the change.
    void getComputedStyle(document.documentElement).color;
  } finally {
    style.remove();
  }
}

/** Set data-theme (and nothing else) without starting colour transitions. */
export function setThemeAttribute(theme: string): void {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;
  withoutTransitions(() => root.setAttribute('data-theme', theme));
}

// ---------------------------------------------------------------------------
// The one theme controller.
//
// Every surface that reads or changes light/dark goes through here: the
// pre-paint script in index.html mirrors `resolveThemePreference`, Settings and
// the Setup Assistant call `setThemePreference`, the command palette and the
// shell call `toggleTheme`, the theme schedule calls `applyTheme`. Before this,
// six writers disagreed at boot (App.tsx forced dark on mount after the OS
// follow had chosen light, an unused store forced dark at import, a preset
// writer applied a third key) and Settings' "Auto" only snapshotted the OS.
//
// Persisted preference (keys kept for existing installs):
//   dex-theme-source = 'system'          -> follow the OS live
//   darkMode = 'true' | 'false'          -> explicit choice (source 'user' or
//                                           legacy installs with no source)
//   nothing stored                       -> dark (DEX's default)
// ---------------------------------------------------------------------------

export type ThemeName = 'dark' | 'light';
export type ThemePreference = ThemeName | 'system';

const DARK_KEY = 'darkMode';
const SOURCE_KEY = 'dex-theme-source';
/** Fired on window after the applied theme changes. detail: { theme }. */
export const THEME_CHANGED_EVENT = 'dex-theme-changed';

export function getThemePreference(): ThemePreference {
  try {
    if (localStorage.getItem(SOURCE_KEY) === 'system') return 'system';
    const stored = localStorage.getItem(DARK_KEY);
    if (stored !== null) return stored === 'false' ? 'light' : 'dark';
  } catch { /* storage unavailable */ }
  return 'dark';
}

function systemTheme(): ThemeName {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

export function resolveThemePreference(pref: ThemePreference = getThemePreference()): ThemeName {
  return pref === 'system' ? systemTheme() : pref;
}

/** The theme currently applied to the document. */
export function currentTheme(): ThemeName {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Apply a theme (dark|light) to root + body without persisting. */
export function applyTheme(theme: ThemeName): void {
  const isDark = theme === 'dark';
  const root = document.documentElement;
  const changed = root.getAttribute('data-theme') !== theme;
  const classesRight = root.classList.contains(isDark ? 'dark-mode' : 'light-mode')
    && !root.classList.contains(isDark ? 'light-mode' : 'dark-mode')
    && document.body.classList.contains(isDark ? 'dark-mode' : 'light-mode');
  if (!changed && classesRight) return;
  withoutTransitions(() => {
    root.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    root.classList.toggle('dark-mode', isDark);
    root.classList.toggle('light-mode', !isDark);
  });
  if (changed) {
    try { window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme } })); } catch { /* noop */ }
    syncNativeWindowTheme(theme);
  }
}

/**
 * Tell the native shell which theme is applied: it paints every DEX window's
 * background to match now, and the main window's before the first paint on
 * the next launch (src-tauri kv key `dex-window-theme`). No-op in the web
 * preview. The bridge is read at call time (never at module scope).
 */
function syncNativeWindowTheme(theme: ThemeName, retry = true): void {
  try {
    const dex = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
    if (!dex?.invoke) {
      // At boot the bridge can arrive after this module runs: try once more
      // after load, with whatever theme is applied by then.
      if (retry && typeof window !== 'undefined') {
        // The page can be gone by the time this fires (window closing, a
        // torn-down test document): then there is nothing left to sync.
        const again = () => { if (typeof document !== 'undefined') syncNativeWindowTheme(currentTheme(), false); };
        if (document.readyState === 'complete') setTimeout(again, 500);
        else window.addEventListener('load', again, { once: true });
      }
      return;
    }
    void dex.invoke('capability:storage:set', 'dex-window-theme', theme)?.catch?.(() => undefined);
  } catch { /* bridge unavailable */ }
}

/** Persist a preference and apply it (an actual flip cross-fades). */
export function setThemePreference(pref: ThemePreference, opts: { animate?: boolean } = {}): void {
  try {
    if (pref === 'system') {
      localStorage.setItem(SOURCE_KEY, 'system');
      localStorage.removeItem(DARK_KEY);
    } else {
      localStorage.setItem(DARK_KEY, String(pref === 'dark'));
      localStorage.setItem(SOURCE_KEY, 'user');
    }
  } catch { /* storage unavailable: still apply for this session */ }
  const next = resolveThemePreference(pref);
  if (next === currentTheme()) {
    applyTheme(next);
    // Auto -> Dark on a dark system changes the choice but not the colours:
    // say so, or the Appearance control keeps showing the old choice.
    try { window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { theme: next } })); } catch { /* noop */ }
    return;
  }
  if (opts.animate !== false) withViewTransition(() => applyTheme(next));
  else applyTheme(next);
}

export function toggleTheme(): void {
  setThemePreference(currentTheme() === 'dark' ? 'light' : 'dark');
}

/** Reset theme to follow OS again. */
export function followSystemTheme(): void {
  setThemePreference('system');
}

let themeListenersInstalled = false;

/**
 * Apply the persisted preference and keep it live: OS scheme changes while
 * following the system, and preference changes made in another DEX window
 * (same-origin webviews share localStorage and receive `storage` events).
 * Idempotent.
 */
export function initTheme(): void {
  applyTheme(resolveThemePreference());
  // The pre-paint script already set data-theme, so applyTheme saw no change;
  // still tell the native shell (its stored theme may be from another choice).
  syncNativeWindowTheme(currentTheme());
  if (themeListenersInstalled || typeof window === 'undefined') return;
  themeListenersInstalled = true;
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemePreference() === 'system') applyTheme(systemTheme());
    });
  } catch { /* matchMedia unavailable */ }
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === DARK_KEY || e.key === SOURCE_KEY) applyTheme(resolveThemePreference());
  });
}
