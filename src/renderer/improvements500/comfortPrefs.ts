// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Comfort & Accessibility preferences (user-controlled layer).
 * -----------------------------------------------------------------------------
 * `a11yPrefs.ts` *reads* the OS accessibility media queries. This module is the
 * in-app override + applier on top of them: the user can force reduced motion,
 * force high contrast, and set a text scale, independent of the OS. Effective
 * settings are applied to <html> as data attributes (`data-reduce-motion`,
 * `data-contrast`) + the `--dex-text-scale` CSS var (see the Comfort block in
 * design-system.css), and persisted to localStorage.
 *
 * Defaults are all "auto"/1 → no behavioural change until the user opts in.
 * `resolveComfort` is pure for testing; `applyComfort` touches the DOM.
 */

import { a11yPrefs } from './a11yPrefs';

/** 'auto' follows the OS; 'on' forces reduce; 'off' forces full motion. */
export type MotionPref = 'auto' | 'on' | 'off';
/** 'auto' follows the OS; 'normal'/'high' force the contrast level. */
export type ContrastPref = 'auto' | 'normal' | 'high';
/** UI density. 'default' is the no-op baseline; compact/comfortable rescale spacing. */
export type DensityPref = 'compact' | 'default' | 'comfortable';

/** Selectable density modes (for Settings UI). */
export const DENSITY_OPTIONS: ReadonlyArray<{ id: DensityPref; label: string }> = [
  { id: 'compact', label: 'Compact' },
  { id: 'default', label: 'Default' },
  { id: 'comfortable', label: 'Comfortable' },
];

const DENSITY_IDS = new Set<DensityPref>(['compact', 'default', 'comfortable']);

export interface ComfortPrefs {
  reduceMotion: MotionPref;
  contrast: ContrastPref;
  /** Root text scale multiplier, clamped to [0.85, 1.4]. 1 = default. */
  textScale: number;
  /** UI density. 'default' = no change. */
  density: DensityPref;
  /** Dark-room mode: near-black surfaces + dimmed text for low-light work. */
  darkroom: boolean;
}

export interface EffectiveComfort {
  reduceMotion: boolean;
  highContrast: boolean;
  textScale: number;
  density: DensityPref;
  darkroom: boolean;
}

export interface OsComfortSignals {
  reducedMotion: boolean;
  highContrast: boolean;
}

export const DEFAULT_COMFORT: ComfortPrefs = {
  reduceMotion: 'auto',
  contrast: 'auto',
  textScale: 1,
  density: 'default',
  darkroom: false,
};

export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.4;

const STORAGE_KEY = 'dex:comfort';

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(hi, Math.max(lo, n));
}

/** Combine user prefs with OS signals into the effective settings to apply. */
export function resolveComfort(prefs: ComfortPrefs, os: OsComfortSignals): EffectiveComfort {
  const reduceMotion = prefs.reduceMotion === 'on' ? true
    : prefs.reduceMotion === 'off' ? false
    : os.reducedMotion;
  const highContrast = prefs.contrast === 'high' ? true
    : prefs.contrast === 'normal' ? false
    : os.highContrast;
  const density = DENSITY_IDS.has(prefs.density as DensityPref) ? prefs.density : 'default';
  return {
    reduceMotion,
    highContrast,
    textScale: clamp(prefs.textScale, TEXT_SCALE_MIN, TEXT_SCALE_MAX),
    density,
    darkroom: prefs.darkroom === true,
  };
}

/** Apply effective comfort settings to <html>. Safe when there is no DOM. */
export function applyComfort(eff: EffectiveComfort): void {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  root.setAttribute('data-reduce-motion', eff.reduceMotion ? 'on' : 'off');
  root.setAttribute('data-contrast', eff.highContrast ? 'high' : 'normal');
  root.style.setProperty('--dex-text-scale', String(eff.textScale));
  // Only override the root font-size when the user actually changed the scale,
  // so the default path leaves the stylesheet untouched.
  if (eff.textScale !== 1) {
    root.style.fontSize = `${Math.round(16 * eff.textScale)}px`;
  } else {
    root.style.removeProperty('font-size');
  }
  // Appearance modes: default values are no-ops, so the attribute is removed
  // rather than written. Each maps to an html[data-*] block in design-system.css.
  const density = eff.density ?? 'default';
  if (density !== 'default') {
    root.setAttribute('data-density', density);
  } else {
    root.removeAttribute('data-density');
  }
  if (eff.darkroom === true) {
    root.setAttribute('data-darkroom', 'on');
  } else {
    root.removeAttribute('data-darkroom');
  }
}

/** Load saved prefs (merged over defaults). */
export function loadComfort(): ComfortPrefs {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_COMFORT };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COMFORT };
    const parsed = JSON.parse(raw) as Partial<ComfortPrefs>;
    return {
      reduceMotion: parsed.reduceMotion ?? DEFAULT_COMFORT.reduceMotion,
      contrast: parsed.contrast ?? DEFAULT_COMFORT.contrast,
      textScale: clamp(parsed.textScale ?? 1, TEXT_SCALE_MIN, TEXT_SCALE_MAX),
      density: DENSITY_IDS.has(parsed.density as DensityPref) ? (parsed.density as DensityPref) : 'default',
      darkroom: parsed.darkroom === true,
    };
  } catch {
    return { ...DEFAULT_COMFORT };
  }
}

/** Persist prefs. */
export function saveComfort(prefs: ComfortPrefs): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* quota / disabled */ }
}

function readOsSignals(): OsComfortSignals {
  return { reducedMotion: a11yPrefs.reducedMotion(), highContrast: a11yPrefs.highContrast() };
}

/** Read OS + saved prefs, resolve, and apply. Returns the effective settings. */
export function initComfort(): EffectiveComfort {
  const eff = resolveComfort(loadComfort(), readOsSignals());
  applyComfort(eff);
  return eff;
}

/** Update one or more prefs, persist, re-apply. Returns new effective settings. */
export function setComfort(patch: Partial<ComfortPrefs>): EffectiveComfort {
  const next = { ...loadComfort(), ...patch };
  saveComfort(next);
  const eff = resolveComfort(next, readOsSignals());
  applyComfort(eff);
  return eff;
}
