// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Accessibility + i18n primitives — wave K.
 *
 *  - WCAG contrast ratio (relative-luminance method)
 *  - AA / AAA classification for body & large text
 *  - Color-blind safe palette suggestions
 *  - aria-label fallbacks for icon-only buttons
 *  - Focusable-element check for keyboard-only nav audits
 *  - String-table foundation: `t(key, vars)` with positional + named
 *    interpolation; English is the canonical fallback.
 *
 * Pure: no DOM, no React, no electron.
 */

// DEX v3.8.9 wave K - a11y + i18n foundation

// ---------------- contrast --------------------------------------------

/** sRGB → linear (per channel). */
function channelLin(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

/** Parse `#rgb`, `#rrggbb`, or `rgb(r,g,b)` into [r,g,b]. Returns null on bad input. */
export function parseColor(input: string): [number, number, number] | null {
  const s = (input ?? '').trim().toLowerCase();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if ([r, g, b].some((v) => Number.isNaN(v))) return null;
      return [r, g, b];
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].some((v) => Number.isNaN(v))) return null;
      return [r, g, b];
    }
    return null;
  }
  const m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Contrast ratio between two colors (1..21). */
export function contrastRatio(fg: string, bg: string): number {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 1;
  const la = relativeLuminance(...a);
  const lb = relativeLuminance(...b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export type ContrastTier = 'fail' | 'AA-large' | 'AA' | 'AAA';

/**
 * Classify contrast for body text. Use `large=true` for ≥18pt or
 * ≥14pt bold text (WCAG large-text rule).
 */
export function classifyContrast(ratio: number, large: boolean = false): ContrastTier {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (large && ratio >= 3) return 'AA-large';
  return 'fail';
}

// ---------------- color-blind palettes --------------------------------

export type ColorBlindAssist = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/**
 * Replace red/green/blue accents with color-blind-safe substitutes.
 * Returns the original color when assist is 'none' or the input is not
 * a recognised problematic color.
 *
 * Substitutes drawn from Wong (2011) palette.
 */
export function recolorForAssist(color: string, assist: ColorBlindAssist): string {
  if (assist === 'none') return color;
  const c = color.toLowerCase();
  if (assist === 'protanopia' || assist === 'deuteranopia') {
    if (c === '#ff453a' || c === '#ff0000') return '#D55E00'; // red → vermillion
    if (c === '#34c759' || c === '#00ff00') return '#0072B2'; // green → blue
    if (c === '#ffcc00') return '#E69F00';
    return color;
  }
  // tritanopia
  if (c === '#0072b2' || c === '#0000ff') return '#56B4E9';
  if (c === '#ffcc00') return '#F0E442';
  return color;
}

// ---------------- aria fallback ---------------------------------------

/**
 * Resolve an aria-label for an icon-only button. Order:
 *  1. explicit `ariaLabel` if provided
 *  2. tooltip text
 *  3. action id, prettified ("notes.new" → "Notes new")
 *  4. literal "Action"
 */
export function resolveAriaLabel(input: {
  ariaLabel?: string | null;
  tooltip?: string | null;
  actionId?: string | null;
}): string {
  if (input.ariaLabel && input.ariaLabel.trim() !== '') return input.ariaLabel.trim();
  if (input.tooltip && input.tooltip.trim() !== '') return input.tooltip.trim();
  if (input.actionId && input.actionId.trim() !== '') {
    return input.actionId
      .replace(/[._-]+/g, ' ')
      .replace(/^\w/, (m) => m.toUpperCase())
      .trim();
  }
  return 'Action';
}

// ---------------- focusable check (keyboard-only audits) --------------

/**
 * Heuristic check that a tag/role combination is keyboard-reachable.
 * Used by audits and the keyboard-only nav lint. Strings only — no DOM.
 */
export function isFocusable(tag: string, role?: string, tabIndex?: number): boolean {
  if (typeof tabIndex === 'number' && tabIndex >= 0) return true;
  const t = tag.toLowerCase();
  if (['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(t)) return true;
  if (role && ['button', 'link', 'menuitem', 'tab', 'switch', 'checkbox'].includes(role)) return true;
  return false;
}

// ---------------- string table foundation -----------------------------

/** Locale id, e.g. "en", "en-US", "es", "fr". */
export type LocaleId = string;

export interface StringTable {
  locale: LocaleId;
  /** key → template string. */
  entries: Record<string, string>;
}

/** Built-in English fallback table. New strings are added here first. */
export const EN_STRINGS: StringTable = {
  locale: 'en',
  entries: {
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.confirm': 'Are you sure?',
    'common.error': 'Something went wrong.',
    'common.loading': 'Loading...',
    'common.empty': 'Nothing here yet.',
    'trial.daysLeft': '{count} day(s) left in your trial',
    'plan.upgrade': 'Upgrade to {plan}',
    'plan.current': "You're on {plan}",
    'toast.saved': 'Saved.',
    'toast.copied': 'Copied to clipboard.',
    'toast.offline': "You're offline — changes saved locally.",
    'autosave.on': 'Autosave is on.',
    'autosave.recovered': 'Recovered from autosave.',
    'disk.warn': 'Disk space is low — free up space soon.',
    'disk.block': 'Disk almost full — DEX paused writes to protect your data.',
    'shortcut.help': 'Keyboard shortcuts',
    'shortcut.search': 'Search shortcuts',
    'a11y.skipToContent': 'Skip to content',
    'a11y.menu': 'Menu',
    'paywall.feature': 'Available on {plan} and above.',
  },
};

const TABLES: Record<LocaleId, StringTable> = {
  en: EN_STRINGS,
};

export function registerStringTable(table: StringTable): void {
  TABLES[table.locale] = table;
}

/** Look up a string. Falls back to English, then to the key itself. */
export function lookupString(key: string, locale: LocaleId): string {
  const table = TABLES[locale] ?? TABLES[locale.split('-')[0]];
  if (table?.entries[key] !== undefined) return table.entries[key];
  if (EN_STRINGS.entries[key] !== undefined) return EN_STRINGS.entries[key];
  return key;
}

/**
 * Translate. Supports `{name}` and `{0}` placeholders. Missing
 * variables render as the original `{name}` placeholder so dev sees
 * the gap.
 */
export function t(key: string, vars: Record<string, string | number> = {}, locale: LocaleId = 'en'): string {
  const template = lookupString(key, locale);
  return template.replace(/\{(\w+)\}/g, (_full, name: string) => {
    if (vars[name] !== undefined && vars[name] !== null) return String(vars[name]);
    return `{${name}}`;
  });
}
