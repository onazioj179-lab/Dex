// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import {
  applyGlassVars, computeInterfaceMaterial, mergePrefs, DEFAULT_SHELL_PREFERENCES,
} from '../../src/renderer/store/shellPreferencesStore';

const root = () => document.documentElement;
const v = (name: string) => root().style.getPropertyValue(name).trim();

afterEach(() => {
  root().removeAttribute('data-perf-tier');
  root().removeAttribute('data-reduce-transparency');
});

describe('interface transparency material', () => {
  it('0% is fully opaque with no blur', () => {
    expect(computeInterfaceMaterial(0)).toEqual({ panel: 100, strong: 100, chrome: 100, blur: 0, saturate: 100 });
  });

  it('opacity falls and blur rises as separate parameters', () => {
    const half = computeInterfaceMaterial(50);
    const full = computeInterfaceMaterial(100);
    expect(full.panel).toBeLessThan(half.panel);
    expect(full.blur).toBeGreaterThan(half.blur);
    expect(full.panel).toBeGreaterThanOrEqual(55); // readable at maximum
    expect(full.blur).toBe(32);
  });

  it('without GPU blur the surface stays mostly opaque', () => {
    const m = computeInterfaceMaterial(100, false);
    expect(m.blur).toBe(0);
    expect(m.panel).toBeGreaterThanOrEqual(88);
  });

  it('defaults to opaque and migrates old glass modes onto the slider', () => {
    expect(DEFAULT_SHELL_PREFERENCES.interfaceTransparency).toBe(0);
    expect(mergePrefs({ glassMode: 'liquid' }).interfaceTransparency).toBe(100);
    expect(mergePrefs({ glassMode: 'off' }).interfaceTransparency).toBe(0);
    expect(mergePrefs({ interfaceTransparency: 140 }).interfaceTransparency).toBe(100);
    expect(mergePrefs({ interfaceTransparency: 40 }).glassMode).toBe('normal');
  });
});

describe('applyGlassVars with the slider', () => {
  const base = { glassMode: 'normal' as const, glassOpacity: 1, glassTint: '#0a0a0a', lowEndMode: false };

  it('mixes theme tokens (works in light and dark) and sets blur', () => {
    applyGlassVars({ ...base, interfaceTransparency: 80 });
    expect(v('--color-bg-glass')).toMatch(/^color-mix\(in srgb, var\(--color-bg-secondary\) \d+%, transparent\)$/);
    expect(v('--glass-blur')).toMatch(/^blur\(\d+px\) saturate\(\d+%\)$/);
    expect(root().getAttribute('data-no-blur')).toBeNull();
    expect(root().getAttribute('data-interface-transparency')).toBe('80');
  });

  it('0% writes opaque theme tokens and disables blur', () => {
    applyGlassVars({ ...base, interfaceTransparency: 0 });
    expect(v('--color-bg-glass')).toBe('var(--color-bg-secondary)');
    expect(v('--glass-blur')).toBe('none');
    expect(root().getAttribute('data-no-blur')).toBe('true');
  });

  it('Reduce Transparency overrides the slider without changing it', () => {
    root().setAttribute('data-reduce-transparency', 'true');
    applyGlassVars({ ...base, interfaceTransparency: 100 });
    expect(root().getAttribute('data-glass-effective-mode')).toBe('reduced');
    expect(v('--color-bg-glass')).toBe('var(--color-bg-secondary)');
    expect(root().getAttribute('data-interface-transparency')).toBe('100');
  });

  it('low perf tier keeps translucency but drops blur', () => {
    root().setAttribute('data-perf-tier', 'low');
    applyGlassVars({ ...base, interfaceTransparency: 100 });
    expect(v('--glass-blur')).toBe('none');
    expect(root().getAttribute('data-no-blur')).toBe('true');
  });
});
