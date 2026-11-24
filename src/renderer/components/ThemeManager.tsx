// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Theme Manager
 * Accent handling and the one-time preference migrations. Light/dark itself is
 * owned by utils/theme (the single controller); the colours come only from the
 * stylesheet (design-system.css [data-theme=...]), never inline.
 */
import { applyAccentFamily } from '../utils/accentFamily';
import { currentTheme, toggleTheme as toggleScheme } from '../utils/theme';

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

/**
 * Palette properties older builds wrote inline on <html> from the preset.
 * Inline values beat the stylesheet, so they pinned light mode's secondary
 * text to #636366 (3.0-4.4:1 on the grey fills the stylesheet's #484C55 was
 * chosen for), overrode both high-contrast palettes, and left one scheme's
 * text on the other scheme's background whenever a writer skipped the preset.
 */
const INLINE_PALETTE_PROPS = [
  '--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary',
  '--color-text-primary', '--color-text-secondary', '--color-border',
];

export const clearInlinePalette = () => {
  const style = document.documentElement.style;
  for (const prop of INLINE_PALETTE_PROPS) style.removeProperty(prop);
};

/** Apply a preset's accent. The scheme (light/dark) is not touched here. */
export const applyTheme = (preset: ThemePreset) => {
  const root = document.documentElement;
  // Expand the accent into the full coherent --color-accent-* family (shared
  // deriver) so hover/dark/light/soft/muted track it. An empty accent means
  // "defer to the stylesheet baseline": clear any inline family.
  if (!preset.accentColor || !applyAccentFamily(preset.accentColor)) {
    for (const prop of ['--color-accent', '--accent-color', '--color-accent-hover', '--color-accent-dark', '--color-accent-light', '--color-accent-soft', '--color-accent-muted', '--color-accent-fill']) {
      root.style.removeProperty(prop);
    }
    root.removeAttribute('data-dex-custom-accent');
  }
  clearInlinePalette();
  try {
    if (preset.accentColor) localStorage.setItem('dex-accent-color', preset.accentColor);
    else localStorage.removeItem('dex-accent-color');
  } catch { /* storage unavailable */ }
};

/** The preset for the scheme that is applied now, carrying the stored accent. */
export const getCurrentTheme = (): ThemePreset => {
  let accentColor = '';
  try { accentColor = localStorage.getItem('dex-accent-color') || ''; } catch { /* unavailable */ }
  return { ...(currentTheme() === 'dark' ? DARK_DEFAULT : LIGHT_DEFAULT), accentColor };
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
  // The preset id and its separate dark flag are superseded by utils/theme's
  // preference; drop them so nothing reads a stale scheme from them.
  try {
    localStorage.removeItem('dex-theme-preset');
    localStorage.removeItem('dex-dark-mode');
  } catch { /* quota/unavailable */ }
  applyTheme(getCurrentTheme());
};

/** Flip light/dark through the theme controller (persists the choice). */
export const toggleTheme = () => toggleScheme();
