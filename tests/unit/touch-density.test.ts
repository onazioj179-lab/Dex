// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Touch & Pen › Control size: the choice persists and drives data-dex-density.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveDensity, setDensityChoice, getDensityChoice, applyDensity, subscribeDensity } from '../../src/renderer/utils/touchDensity';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-dex-density');
});

describe('touch density', () => {
  it('Automatic follows the primary pointer; explicit choices override it', () => {
    expect(resolveDensity('auto', true)).toBe('touch');
    expect(resolveDensity('auto', false)).toBe('precision');
    expect(resolveDensity('touch', false)).toBe('touch');
    expect(resolveDensity('precision', true)).toBe('precision');
  });

  it('persists the choice, sets the attribute and notifies listeners', () => {
    const seen = vi.fn();
    const off = subscribeDensity(seen);
    setDensityChoice('touch');
    expect(getDensityChoice()).toBe('touch');
    expect(document.documentElement.getAttribute('data-dex-density')).toBe('touch');
    expect(seen).toHaveBeenCalledWith('touch');
    setDensityChoice('auto');
    expect(localStorage.getItem('dex-touch-density')).toBeNull();
    off();
  });

  it('defaults to Automatic and applies precision on a mouse-only device', () => {
    expect(getDensityChoice()).toBe('auto');
    expect(applyDensity()).toBe('precision');
    expect(document.documentElement.getAttribute('data-dex-density')).toBe('precision');
  });
});
