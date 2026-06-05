// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { normalizeHue, harmonyHues, hueDistance } from '../../src/shared/creative/colorHarmony';

describe('color harmony', () => {
  it('normalizes hues into [0,360)', () => {
    expect(normalizeHue(-30)).toBe(330);
    expect(normalizeHue(370)).toBe(10);
    expect(normalizeHue(0)).toBe(0);
  });

  it('produces scheme hues', () => {
    expect(harmonyHues(0, 'complementary')).toEqual([0, 180]);
    expect(harmonyHues(30, 'analogous')).toEqual([0, 30, 60]);
    expect(harmonyHues(0, 'triadic')).toEqual([0, 120, 240]);
    expect(harmonyHues(0, 'tetradic')).toEqual([0, 90, 180, 270]);
    expect(harmonyHues(0, 'split-complementary')).toEqual([0, 150, 210]);
    expect(harmonyHues(200, 'monochromatic')).toEqual([200]);
  });

  it('wraps around the wheel', () => {
    expect(harmonyHues(350, 'analogous')).toEqual([320, 350, 20]);
  });

  it('computes angular hue distance', () => {
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
  });
});
