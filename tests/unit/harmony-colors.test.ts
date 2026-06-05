// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { harmonyPalette, harmonyHexes, monochromeRamp } from '../../src/shared/creative/harmonyColors';

describe('harmony colors', () => {
  it('builds a complementary RGB palette', () => {
    const pal = harmonyPalette({ h: 0, s: 100, l: 50 }, 'complementary');
    expect(pal[0]).toEqual({ r: 255, g: 0, b: 0 });   // red
    expect(pal[1]).toEqual({ r: 0, g: 255, b: 255 }); // cyan
  });

  it('builds hex swatches from a base RGB', () => {
    expect(harmonyHexes({ r: 255, g: 0, b: 0 }, 'complementary')).toEqual(['#ff0000', '#00ffff']);
  });

  it('builds a monochrome ramp dark→light', () => {
    const ramp = monochromeRamp({ h: 0, s: 100, l: 50 }, 3);
    expect(ramp[0]).toEqual({ r: 0, g: 0, b: 0 });       // l=0 black
    expect(ramp[1]).toEqual({ r: 255, g: 0, b: 0 });     // l=50 red
    expect(ramp[2]).toEqual({ r: 255, g: 255, b: 255 }); // l=100 white
  });
});
