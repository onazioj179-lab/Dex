// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { sampleScale, colorScale, gradient } from '../../src/shared/creative/colorScale';

const K = { r: 0, g: 0, b: 0 };
const W = { r: 255, g: 255, b: 255 };

describe('color scale', () => {
  it('samples a two-stop gradient', () => {
    expect(sampleScale([K, W], 0)).toEqual(K);
    expect(sampleScale([K, W], 1)).toEqual(W);
    expect(sampleScale([K, W], 0.5)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('clamps t and handles single/empty stops', () => {
    expect(sampleScale([K, W], 2)).toEqual(W);
    expect(sampleScale([W], 0.3)).toEqual(W);
    expect(sampleScale([], 0.5)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('generates n evenly-spaced colors', () => {
    const scale = colorScale([K, W], 3);
    expect(scale).toEqual([K, { r: 128, g: 128, b: 128 }, W]);
    expect(colorScale([K, W], 1)).toEqual([K]);
    expect(colorScale([K, W], 0)).toEqual([]);
  });

  it('gradient is a two-stop scale', () => {
    expect(gradient(K, W, 2)).toEqual([K, W]);
  });
});
