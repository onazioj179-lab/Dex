// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Regression: presets write text/background colours inline on <html>, but the
// Settings Dark Mode switch only flipped data-theme, so light mode rendered the
// dark preset's #fafafa text on a light background (1.00:1). syncPresetToScheme
// keeps the preset and the scheme in step.
//
import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, syncPresetToScheme, installSchemePresetSync, THEME_PRESETS } from '../../src/renderer/components/ThemeManager';

const root = () => document.documentElement;
const preset = (id: string) => THEME_PRESETS.find(p => p.id === id)!;

describe('syncPresetToScheme', () => {
  beforeEach(() => {
    localStorage.clear();
    root().removeAttribute('style');
    applyTheme(preset('dark-default'));
  });

  it('switching to light replaces the dark preset inline colours', () => {
    expect(root().style.getPropertyValue('--color-text-primary')).toBe(preset('dark-default').textPrimary);
    syncPresetToScheme('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(root().style.getPropertyValue('--color-text-primary')).toBe(preset('light-default').textPrimary);
    expect(localStorage.getItem('dex-theme-preset')).toBe('light-default');
  });

  it('is a no-op when the preset already matches the scheme', () => {
    syncPresetToScheme('dark');
    expect(localStorage.getItem('dex-theme-preset')).toBe('dark-default');
    expect(root().style.getPropertyValue('--color-text-primary')).toBe(preset('dark-default').textPrimary);
  });
});

describe('installSchemePresetSync', () => {
  it('follows data-theme no matter which code path writes it', async () => {
    localStorage.clear();
    root().removeAttribute('style');
    applyTheme(preset('dark-default'));
    installSchemePresetSync();
    // e.g. utils/theme or Settings flipping only the attribute:
    root().setAttribute('data-theme', 'light');
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver delivers async
    expect(root().style.getPropertyValue('--color-text-primary')).toBe(preset('light-default').textPrimary);
    root().setAttribute('data-theme', 'dark');
    await new Promise((r) => setTimeout(r, 0));
    expect(root().style.getPropertyValue('--color-text-primary')).toBe(preset('dark-default').textPrimary);
    expect(root().getAttribute('data-theme')).toBe('dark');
  });
});
