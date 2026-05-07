// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform v4.0.1 - Wave D image stack tests
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  newLayer, moveLayer, setLayerProp, addAdjustment, reorderAdjustment, flattenForExport,
  blendPixel,
  rgbToHsl, hslToRgb, srgbToLinear, linearToSrgb,
  applyExposure, applyContrast, applyGamma, applyLevels,
  buildLut1d, evaluateLut1d,
  tileKey,
  buildHistogram, analyseAutoCorrect,
} from '../../src/shared/image/layers';

describe('layer ops', () => {
  it('creates layer with defaults', () => {
    const l = newLayer({ id: '1', name: 'a' });
    expect(l.visible).toBe(true);
    expect(l.opacity).toBe(1);
  });
  it('moves layer', () => {
    const stack = { layers: [newLayer({ id: '1', name: 'a' }), newLayer({ id: '2', name: 'b' })] };
    expect(moveLayer(stack, '1', 1).layers[1].id).toBe('1');
  });
  it('sets layer prop immutably', () => {
    const stack = { layers: [newLayer({ id: '1', name: 'a' })] };
    const next = setLayerProp(stack, '1', 'opacity', 0.5);
    expect(next.layers[0].opacity).toBe(0.5);
    expect(stack.layers[0].opacity).toBe(1);
  });
  it('adds and reorders adjustments', () => {
    let stack = { layers: [newLayer({ id: '1', name: 'a' })] };
    stack = addAdjustment(stack, '1', { id: 'a', kind: 'exposure', amount: 0.5, enabled: true });
    stack = addAdjustment(stack, '1', { id: 'b', kind: 'contrast', amount: 0.2, enabled: true });
    stack = reorderAdjustment(stack, '1', 'b', 0);
    expect(stack.layers[0].adjustments[0].id).toBe('b');
  });
  it('flattens groups for export and skips invisible', () => {
    const stack = {
      layers: [
        { ...newLayer({ id: 'g', name: 'group' }), kind: 'group' as const, children: [newLayer({ id: 'c', name: 'child' })] },
        { ...newLayer({ id: 'h', name: 'hidden' }), visible: false },
      ],
    };
    const flat = flattenForExport(stack);
    expect(flat.map(l => l.id)).toEqual(['c']);
  });
});

describe('blend', () => {
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const white = { r: 1, g: 1, b: 1, a: 1 };
  it('multiply with black is black', () => {
    expect(blendPixel(white, black, 'multiply', 1).r).toBeCloseTo(0);
  });
  it('screen with white is white', () => {
    expect(blendPixel(black, white, 'screen', 1).r).toBeCloseTo(1);
  });
  it('opacity 0 returns base', () => {
    expect(blendPixel(white, black, 'multiply', 0).r).toBeCloseTo(1);
  });
  it('difference is symmetric', () => {
    const a = blendPixel({ r: 0.7, g: 0, b: 0, a: 1 }, { r: 0.3, g: 0, b: 0, a: 1 }, 'difference', 1);
    expect(a.r).toBeCloseTo(0.4);
  });
});

describe('color conversions', () => {
  it('rgb -> hsl -> rgb roundtrips', () => {
    const hsl = rgbToHsl(0.4, 0.6, 0.8);
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    expect(rgb.r).toBeCloseTo(0.4, 2);
    expect(rgb.g).toBeCloseTo(0.6, 2);
    expect(rgb.b).toBeCloseTo(0.8, 2);
  });
  it('srgb <-> linear', () => {
    expect(linearToSrgb(srgbToLinear(0.5))).toBeCloseTo(0.5, 4);
  });
});

describe('adjustments', () => {
  it('exposure scales by 2^stops', () => {
    expect(applyExposure(0.1, 1)).toBeCloseTo(0.2);
  });
  it('contrast around midpoint', () => {
    expect(applyContrast(0.5, 1)).toBeCloseTo(0.5);
    expect(applyContrast(0.7, 0.5)).toBeCloseTo(0.8);
  });
  it('gamma identity at 1', () => {
    expect(applyGamma(0.4, 1)).toBeCloseTo(0.4);
  });
  it('levels remap', () => {
    expect(applyLevels(0.5, 0, 1, 1, 0, 1)).toBeCloseTo(0.5);
    expect(applyLevels(0.5, 0, 1, 1, 0, 0.5)).toBeCloseTo(0.25);
  });
});

describe('LUT', () => {
  it('builds and evaluates 1D LUT', () => {
    const lut = buildLut1d(256, v => 1 - v);
    expect(evaluateLut1d(lut, 0.25)).toBeCloseTo(0.75, 2);
  });
});

describe('cache key', () => {
  it('changes with version', () => {
    expect(tileKey('a', 0, 0, 0, 1)).not.toBe(tileKey('a', 0, 0, 0, 2));
  });
});

describe('histogram + auto correct', () => {
  it('histogram totals match pixels', () => {
    const px = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    const h = buildHistogram(px);
    expect(h.r.reduce((a, b) => a + b)).toBe(2);
  });
  it('analyseAutoCorrect returns finite numbers', () => {
    const px = new Uint8Array(1000 * 4);
    for (let i = 0; i < px.length; i += 4) { px[i] = 50; px[i + 1] = 50; px[i + 2] = 50; px[i + 3] = 255; }
    const advice = analyseAutoCorrect(buildHistogram(px));
    expect(Number.isFinite(advice.exposure)).toBe(true);
    expect(Number.isFinite(advice.contrast)).toBe(true);
  });
});
