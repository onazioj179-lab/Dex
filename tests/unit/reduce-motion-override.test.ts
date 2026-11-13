// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Settings › Reduce Motion must reach JS-driven motion, not just CSS tokens.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isReduceMotion, onReduceMotionChange, setReduceMotionOverride,
} from '../../src/renderer/utils/MotionController';

describe('setReduceMotionOverride', () => {
  afterEach(() => setReduceMotionOverride(null));

  it('forces reduce motion on: flag, class, storage and listeners', () => {
    const seen = vi.fn();
    const off = onReduceMotionChange(seen);
    setReduceMotionOverride(true);
    expect(isReduceMotion()).toBe(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    expect(localStorage.getItem('dex-reduce-motion')).toBe('true');
    expect(seen).toHaveBeenCalledWith(true);
    off();
  });

  it('null follows the OS again and clears the stored choice', () => {
    setReduceMotionOverride(true);
    setReduceMotionOverride(null);
    expect(localStorage.getItem('dex-reduce-motion')).toBeNull();
    // jsdom has no reduced-motion preference.
    expect(isReduceMotion()).toBe(false);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });

  it('does not notify listeners when nothing changes', () => {
    setReduceMotionOverride(null);
    const seen = vi.fn();
    const off = onReduceMotionChange(seen);
    setReduceMotionOverride(null);
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});
