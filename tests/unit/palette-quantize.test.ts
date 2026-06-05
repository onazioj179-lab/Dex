// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { quantizePalette, dominantColor } from '../../src/shared/creative/paletteQuantize';

describe('palette quantize', () => {
  it('returns dominant colors sorted by frequency', () => {
    // 2 red pixels, 1 blue pixel (RGBA)
    const rgba = [255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255];
    const palette = quantizePalette(rgba, 8);
    expect(palette[0]).toEqual({ r: 255, g: 0, b: 0, count: 2 });
    expect(palette[1]).toMatchObject({ r: 0, g: 0, b: 255, count: 1 });
  });

  it('ignores fully transparent pixels', () => {
    const rgba = [10, 20, 30, 0, 255, 0, 0, 255];
    const palette = quantizePalette(rgba, 8);
    expect(palette).toHaveLength(1);
    expect(palette[0]).toMatchObject({ r: 255, g: 0, b: 0 });
  });

  it('limits to maxColors', () => {
    const rgba = [0, 0, 0, 255, 80, 80, 80, 255, 200, 200, 200, 255];
    expect(quantizePalette(rgba, 2)).toHaveLength(2);
  });

  it('dominantColor returns the top color or null', () => {
    expect(dominantColor([255, 0, 0, 255])).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(dominantColor([])).toBeNull();
    expect(dominantColor([1, 2, 3, 0])).toBeNull(); // only transparent
  });
});
