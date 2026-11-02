// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGlassVars,
  mergePrefs,
  prefsToTransparency,
  transparencyToPrefs,
  DEFAULT_SHELL_PREFERENCES,
  GLASS_OPACITY_FLOOR,
} from '../../src/renderer/store/shellPreferencesStore';

const root = () => document.documentElement;
const v = (name: string) => root().style.getPropertyValue(name);

describe('Interface Transparency slider mapping', () => {
  it('0% is fully opaque: glass off, opacity 1', () => {
    expect(transparencyToPrefs(0)).toEqual({ glassMode: 'off', glassOpacity: 1 });
  });

  it('100% is the most translucent supported glass (shared opacity floor)', () => {
    const p = transparencyToPrefs(100);
    expect(p.glassMode).toBe('normal');
    expect(p.glassOpacity).toBeCloseTo(GLASS_OPACITY_FLOOR, 5);
  });

  it('never swaps the glass style mid-drag: Liquid stays Liquid, anything else is Refined', () => {
    expect(transparencyToPrefs(30, 'liquid').glassMode).toBe('liquid');
    expect(transparencyToPrefs(95, 'normal').glassMode).toBe('normal');
    expect(transparencyToPrefs(30, 'reduced').glassMode).toBe('normal');
    expect(transparencyToPrefs(0, 'liquid').glassMode).toBe('off');
  });

  it('is monotonic: more transparency never raises opacity', () => {
    let prev = 2;
    for (let t = 5; t <= 100; t += 5) {
      const { glassOpacity } = transparencyToPrefs(t);
      expect(glassOpacity).toBeLessThanOrEqual(prev);
      prev = glassOpacity;
    }
  });

  it('round-trips through prefsToTransparency on the 5% grid', () => {
    for (let t = 0; t <= 100; t += 5) {
      expect(prefsToTransparency(transparencyToPrefs(t))).toBe(t);
    }
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(transparencyToPrefs(-40).glassMode).toBe('off');
    expect(transparencyToPrefs(900).glassOpacity).toBeCloseTo(GLASS_OPACITY_FLOOR, 5);
    expect(transparencyToPrefs(NaN).glassMode).toBe('off');
  });

  it('the refined default (opacity 0.82) shows as 40% on the slider', () => {
    expect(prefsToTransparency(DEFAULT_SHELL_PREFERENCES)).toBe(40);
  });

  it('persists glassBlur separately and clamps it', () => {
    expect(mergePrefs({ glassBlur: 18 }).glassBlur).toBe(18);
    expect(mergePrefs({ glassBlur: 999 }).glassBlur).toBe(40);
    expect(mergePrefs({ glassBlur: -3 }).glassBlur).toBe(4);
    expect(mergePrefs({}).glassBlur).toBe(DEFAULT_SHELL_PREFERENCES.glassBlur);
  });
});

describe('applyGlassVars is theme-aware', () => {
  beforeEach(() => {
    root().removeAttribute('data-theme');
    root().removeAttribute('style');
  });

  it('opaque mode in light theme emits light solids, not the dark ones', () => {
    root().setAttribute('data-theme', 'light');
    applyGlassVars({ ...DEFAULT_SHELL_PREFERENCES, ...transparencyToPrefs(0) });
    expect(v('--color-bg-glass')).toBe('#FFFFFF');
    expect(v('--dex-glass-blur')).toBe('0px');
  });

  it('opaque mode in dark theme keeps the dark solids', () => {
    root().setAttribute('data-theme', 'dark');
    applyGlassVars({ ...DEFAULT_SHELL_PREFERENCES, ...transparencyToPrefs(0) });
    expect(v('--color-bg-glass')).toBe('#1C1C1E');
  });

  it('glass mode in light theme tints light (default tint) and honours blur strength', () => {
    root().setAttribute('data-theme', 'light');
    applyGlassVars({ ...DEFAULT_SHELL_PREFERENCES, ...transparencyToPrefs(50), glassBlur: 12 });
    expect(v('--color-bg-glass')).toMatch(/^rgba\(255, 255, 255,/);
    expect(v('--dex-glass-blur')).toContain('blur(12px)');
  });

  it('blur strength is independent of opacity', () => {
    root().setAttribute('data-theme', 'dark');
    applyGlassVars({ ...DEFAULT_SHELL_PREFERENCES, ...transparencyToPrefs(30), glassBlur: 30 });
    const a = v('--dex-glass-blur');
    applyGlassVars({ ...DEFAULT_SHELL_PREFERENCES, ...transparencyToPrefs(60), glassBlur: 30 });
    expect(v('--dex-glass-blur')).toBe(a);
  });
});
