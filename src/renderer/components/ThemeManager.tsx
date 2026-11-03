// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Theme Manager
 * Applies the DEX Blue Modern light/dark preset and keeps it in step with the
 * active scheme. Accent choice lives in Settings > Appearance.
 */
import { applyAccentFamily } from '../utils/accentFamily';

// Theme presets
export interface ThemePreset {
  id: string;
  name: string;
  isDark: boolean;
  accentColor: string;
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

// DEX Blue Modern is the only scheme: one dark and one light preset. The old
// coloured presets (purple/green/orange/rose/warm/sky) were retired with the
// panel that offered them; installs still on one migrate in initializeTheme.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark-default',
    name: 'Dark Default',
    isDark: true,
    accentColor: '', // empty = defer to the stylesheet baseline accent (macOS system blue)
    bgPrimary: '#1C1C1E',
    bgSecondary: '#111215',
    bgTertiary: '#2C2C2E',
    textPrimary: '#F5F5F7',
    textSecondary: '#AEAEB2',
    border: '#38383A',
  },
  {
    id: 'light-default',
    name: 'Light Default',
    isDark: false,
    accentColor: '', // empty = defer to the stylesheet baseline accent
    bgPrimary: '#FFFFFF',
    bgSecondary: '#F5F5F7',
    bgTertiary: '#F2F2F7',
    textPrimary: '#1D1D1F',
    textSecondary: '#636366',
    border: '#D1D1D6',
  },
];

const DARK_DEFAULT = THEME_PRESETS[0];
const LIGHT_DEFAULT = THEME_PRESETS[1];

/** Accents the retired presets wrote to dex-accent-color on the user's behalf. */
const RETIRED_PRESET_ACCENTS: Record<string, string> = {
  'dark-purple': '#a855f7', 'dark-green': '#10b981', 'dark-orange': '#f97316',
  'dark-rose': '#f43f5e', 'light-warm': '#f59e0b', 'light-blue': '#0ea5e9',
};

// Apply theme to document
export const applyTheme = (preset: ThemePreset) => {
  const root = document.documentElement;
  
  // Expand the preset accent into the full coherent --color-accent-* family
  // (shared deriver) rather than only the base, so hover/dark/light/soft/muted
  // track the chosen colour. An empty accent means "defer to the stylesheet
  // baseline": clear any inline family instead of forcing a colour.
  if (!preset.accentColor || !applyAccentFamily(preset.accentColor)) {
    for (const prop of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft', '--color-accent-muted', '--color-accent-fill']) {
      root.style.removeProperty(prop);
    }
    root.removeAttribute('data-dex-custom-accent');
  }
  root.style.setProperty('--color-bg-primary', preset.bgPrimary);
  root.style.setProperty('--color-bg-secondary', preset.bgSecondary);
  root.style.setProperty('--color-bg-tertiary', preset.bgTertiary);
  root.style.setProperty('--color-text-primary', preset.textPrimary);
  root.style.setProperty('--color-text-secondary', preset.textSecondary);
  root.style.setProperty('--color-border', preset.border);
  
  if (preset.isDark) {
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
  } else {
    root.setAttribute('data-theme', 'light');
    document.body.classList.remove('dark-mode');
  }
  
  // Save to localStorage
  localStorage.setItem('dex-theme-preset', preset.id);
  localStorage.setItem('dex-dark-mode', String(preset.isDark));
  localStorage.setItem('dex-accent-color', preset.accentColor);
};

// Get current theme from localStorage
export const getCurrentTheme = (): ThemePreset => {
  try {
    const presetId = localStorage.getItem('dex-theme-preset');
    if (presetId) {
      const preset = THEME_PRESETS.find(p => p.id === presetId);
      if (preset) return preset;
    }
    
    // Fall back to dark/light detection. No stored accent = defer to the
    // stylesheet baseline (empty), never force a hardcoded colour at boot.
    const isDark = localStorage.getItem('dex-dark-mode') !== 'false';
    const accentColor = localStorage.getItem('dex-accent-color') || '';
    
    const basePreset = isDark ? DARK_DEFAULT : LIGHT_DEFAULT;
    return { ...basePreset, accentColor };
  } catch {
    return DARK_DEFAULT;
  }
};

// Initialize theme on app load
export const initializeTheme = () => {
  // One-time migration: the old applyTheme auto-saved the hardcoded '#3b82f6'
  // default on every boot, so installs carry it without the user ever choosing
  // it. Clear that stored value once so the stylesheet baseline (Omnitrix
  // green) becomes the effective default; deliberate accent picks survive.
  // One-time: the owner retired the green accent. Installs still carrying the
  // old Omnitrix-green default (stored here or in Settings) move to the
  // stylesheet baseline (macOS blue).
  try {
    if (!localStorage.getItem('dex-accent-macos-migrated')) {
      if ((localStorage.getItem('dex-accent-color') || '').toLowerCase() === '#32d74b') {
        localStorage.removeItem('dex-accent-color');
      }
      const raw = localStorage.getItem('dex-settings');
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.accentColor === 'string' && s.accentColor.toLowerCase() === '#32d74b') {
          s.accentColor = 'var(--color-accent)';
          localStorage.setItem('dex-settings', JSON.stringify(s));
        }
      }
      localStorage.setItem('dex-accent-macos-migrated', '1');
    }
  } catch { /* quota/unavailable/corrupt settings */ }
  try {
    if (!localStorage.getItem('dex-accent-omnitrix-migrated')) {
      if (localStorage.getItem('dex-accent-color') === '#3b82f6') {
        localStorage.removeItem('dex-accent-color');
      }
      localStorage.setItem('dex-accent-omnitrix-migrated', '1');
    }
  } catch { /* quota/unavailable */ }
  // Retired coloured presets: drop the preset and the accent it set (an accent
  // the user picked separately afterwards differs from it and is kept).
  try {
    const presetId = localStorage.getItem('dex-theme-preset') || '';
    const retiredAccent = RETIRED_PRESET_ACCENTS[presetId];
    if (retiredAccent) {
      localStorage.removeItem('dex-theme-preset');
      if ((localStorage.getItem('dex-accent-color') || '').toLowerCase() === retiredAccent) {
        localStorage.removeItem('dex-accent-color');
      }
    }
  } catch { /* quota/unavailable */ }
  const theme = getCurrentTheme();
  applyTheme(theme);
};

/**
 * Keep the colour preset consistent with the light/dark scheme. Presets write
 * text/background/border colours INLINE on <html>; the other scheme switches
 * (Settings > Appearance > Dark Mode, useStore.setTheme/toggleTheme) only
 * flipped `data-theme`, so switching to light kept the dark preset's #fafafa
 * text over a light background (measured 1.00:1 contrast). When the active
 * preset belongs to the other scheme, move to that scheme's default preset,
 * keeping the user's accent, exactly as toggleTheme() does.
 */
export const syncPresetToScheme = (theme: 'dark' | 'light') => {
  const current = getCurrentTheme();
  if (current.isDark === (theme === 'dark')) return;
  const target = THEME_PRESETS.find(p => p.id === (theme === 'dark' ? 'dark-default' : 'light-default'));
  if (target) applyTheme({ ...target, accentColor: current.accentColor });
};

let schemeObserver: MutationObserver | null = null;

/**
 * Keep the preset in step with <html data-theme> no matter WHO sets it. Six
 * code paths write data-theme (the pre-paint script in index.html, App.tsx,
 * utils/theme incl. OS-follow, useStore, Settings, the command palette) and at
 * boot they run in an order that can leave the light preset's dark text on the
 * dark scheme (measured 1.34:1) or the dark preset's light text on the light
 * scheme (1.00:1). Observing the attribute fixes every path in one place.
 * applyTheme() re-sets the same value, so the observer settles immediately.
 */
export const installSchemePresetSync = () => {
  if (schemeObserver || typeof MutationObserver === 'undefined') return;
  const sync = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') syncPresetToScheme(t);
  };
  schemeObserver = new MutationObserver(sync);
  schemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  sync();
};

// Toggle between dark and light theme
export const toggleTheme = () => {
  const current = getCurrentTheme();
  const isDark = current.isDark;
  
  // Find corresponding theme in opposite mode
  const newPreset = isDark ? LIGHT_DEFAULT : DARK_DEFAULT;
  applyTheme({ ...newPreset, accentColor: current.accentColor });
};
