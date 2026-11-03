// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Regression (Part 8, found by clicking the slider in the rendered Settings):
// on a fresh install the one-time "glass refined" migration never marked itself
// done, so the user's first saved choice of 0% transparency (glassMode 'off')
// was flipped back to glass on the next launch.

import { describe, it, expect, beforeEach, vi } from 'vitest';

async function launch() {
  vi.resetModules();
  return (await import('../../src/renderer/store/shellPreferencesStore')).useShellPreferences;
}

describe('glass choice survives a relaunch', () => {
  beforeEach(() => localStorage.clear());

  it('keeps 0% (opaque) chosen on a fresh install', async () => {
    const first = await launch();
    first.getState().setGlassMode('off');
    expect(JSON.parse(localStorage.getItem('dex-shell-preferences-v1')!).glassMode).toBe('off');

    const second = await launch();
    expect(second.getState().glassMode).toBe('off');
    expect(document.documentElement.getAttribute('data-glass-mode')).toBe('off');
  });

  it('still migrates a pre-existing 2026-07 forced-solid install once', async () => {
    localStorage.setItem('dex-shell-preferences-v1', JSON.stringify({ glassMode: 'off', glassOpacity: 1 }));
    const store = await launch();
    expect(store.getState().glassMode).toBe('normal');
    store.getState().setGlassMode('off');
    const again = await launch();
    expect(again.getState().glassMode).toBe('off');
  });
});
