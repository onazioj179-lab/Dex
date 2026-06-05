// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  luminanceHistogram, channelHistograms, histogramPeak, histogramMean,
} from '../../src/shared/creative/histogram';

describe('image histogram', () => {
  it('builds a luminance histogram from RGBA', () => {
    // one white pixel, one black pixel
    const rgba = [255, 255, 255, 255, 0, 0, 0, 255];
    const bins = luminanceHistogram(rgba);
    expect(bins).toHaveLength(256);
    expect(bins[255]).toBe(1);
    expect(bins[0]).toBe(1);
  });

  it('builds per-channel histograms', () => {
    const rgba = [255, 0, 0, 255]; // pure red
    const { r, g, b } = channelHistograms(rgba);
    expect(r[255]).toBe(1);
    expect(g[0]).toBe(1);
    expect(b[0]).toBe(1);
  });

  it('finds peak bin and mean level', () => {
    const bins = new Array(256).fill(0);
    bins[0] = 1; bins[255] = 1;
    expect(histogramPeak(bins)).toBe(1);
    expect(histogramMean(bins)).toBeCloseTo(127.5, 5);
    expect(histogramMean(new Array(256).fill(0))).toBe(0);
  });
});
