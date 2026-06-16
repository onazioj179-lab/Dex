// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveComfort,
  applyComfort,
  setComfort,
  loadComfort,
  DEFAULT_COMFORT,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
} from '../../src/renderer/improvements500/comfortPrefs';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  const root = document.documentElement;
  root.removeAttribute('data-reduce-motion');
  root.removeAttribute('data-contrast');
  root.removeAttribute('data-density');
  root.removeAttribute('data-darkroom');
  root.style.removeProperty('--dex-text-scale');
  root.style.removeProperty('font-size');
});

describe('comfortPrefs.resolveComfort', () => {
  it('auto follows the OS signals', () => {
    const eff = resolveComfort(DEFAULT_COMFORT, { reducedMotion: true, highContrast: true });
    expect(eff.reduceMotion).toBe(true);
    expect(eff.highContrast).toBe(true);
  });

  it('explicit on/off overrides the OS', () => {
    const eff = resolveComfort(
      { reduceMotion: 'off', contrast: 'high', textScale: 1 },
      { reducedMotion: true, highContrast: false },
    );
    expect(eff.reduceMotion).toBe(false); // user forced off despite OS reduce
    expect(eff.highContrast).toBe(true);  // user forced high despite OS normal
  });

  it('clamps the text scale to the allowed range', () => {
    expect(resolveComfort({ ...DEFAULT_COMFORT, textScale: 5 }, { reducedMotion: false, highContrast: false }).textScale).toBe(TEXT_SCALE_MAX);
    expect(resolveComfort({ ...DEFAULT_COMFORT, textScale: 0.1 }, { reducedMotion: false, highContrast: false }).textScale).toBe(TEXT_SCALE_MIN);
  });
});

describe('comfortPrefs.applyComfort', () => {
  it('writes data attributes and only sets font-size when scaled', () => {
    applyComfort({ reduceMotion: true, highContrast: true, textScale: 1 });
    const root = document.documentElement;
    expect(root.getAttribute('data-reduce-motion')).toBe('on');
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.style.fontSize).toBe(''); // scale 1 leaves font-size untouched

    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1.25 });
    expect(root.getAttribute('data-reduce-motion')).toBe('off');
    expect(root.style.fontSize).toBe('20px'); // 16 * 1.25
    expect(root.style.getPropertyValue('--dex-text-scale')).toBe('1.25');
  });
});

describe('comfortPrefs.setComfort', () => {
  it('persists and re-applies', () => {
    setComfort({ contrast: 'high' });
    expect(loadComfort().contrast).toBe('high');
    expect(document.documentElement.getAttribute('data-contrast')).toBe('high');
  });
});

describe('comfortPrefs density / dark-room', () => {
  it('resolveComfort passes valid density through and defaults invalid', () => {
    const os = { reducedMotion: false, highContrast: false };
    expect(resolveComfort({ ...DEFAULT_COMFORT, density: 'compact' }, os).density).toBe('compact');
    expect(resolveComfort({ ...DEFAULT_COMFORT, density: 'comfortable' }, os).density).toBe('comfortable');
    // unknown value falls back to the no-op default
    expect(resolveComfort({ ...DEFAULT_COMFORT, density: 'huge' as never }, os).density).toBe('default');
  });

  it('applyComfort writes data-density only when non-default', () => {
    const root = document.documentElement;
    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1, density: 'compact', darkroom: false });
    expect(root.getAttribute('data-density')).toBe('compact');
    // back to default clears the attribute
    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1, density: 'default', darkroom: false });
    expect(root.getAttribute('data-density')).toBeNull();
  });

  it('applyComfort toggles data-darkroom', () => {
    const root = document.documentElement;
    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1, density: 'default', darkroom: true });
    expect(root.getAttribute('data-darkroom')).toBe('on');
    applyComfort({ reduceMotion: false, highContrast: false, textScale: 1, density: 'default', darkroom: false });
    expect(root.getAttribute('data-darkroom')).toBeNull();
  });

  it('setComfort persists density and dark-room', () => {
    setComfort({ density: 'comfortable', darkroom: true });
    const saved = loadComfort();
    expect(saved.density).toBe('comfortable');
    expect(saved.darkroom).toBe(true);
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-darkroom')).toBe('on');
  });
});
