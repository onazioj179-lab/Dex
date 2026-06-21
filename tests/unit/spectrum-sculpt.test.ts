// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Vinx Spectrum Sculpt — per-hue-band color warp (pure HSL math).
import { describe, it, expect } from 'vitest';
import { applySpectrumBands, defaultSpectrumBands, type SpectrumSculptBand } from '../../src/shared/creative/spectrumSculpt';

describe('applySpectrumBands', () => {
  it('default (neutral) bands leave a color unchanged', () => {
    const [h, s, l] = applySpectrumBands(0.33, 0.7, 0.5, defaultSpectrumBands());
    expect(h).toBeCloseTo(0.33, 5);
    expect(s).toBeCloseTo(0.7, 5);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('rotates hue within a band (full falloff at center)', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.0, hueWidth: 0.2, hueShift: 0.1, satScale: 1, lumShift: 0 }];
    const [h] = applySpectrumBands(0.0, 0.8, 0.5, bands);
    expect(h).toBeCloseTo(0.1, 5);
  });

  it('scales saturation within a band (satScale 0 -> desaturated)', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.33, hueWidth: 0.2, hueShift: 0, satScale: 0, lumShift: 0 }];
    const [, s] = applySpectrumBands(0.33, 0.8, 0.5, bands);
    expect(s).toBeCloseTo(0, 5);
  });

  it('leaves out-of-band colors untouched', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.0, hueWidth: 0.1, hueShift: 0.3, satScale: 2, lumShift: 0.2 }];
    const [h, s, l] = applySpectrumBands(0.5, 0.6, 0.5, bands); // hue 0.5 is far from band at 0.0
    expect(h).toBeCloseTo(0.5, 5);
    expect(s).toBeCloseTo(0.6, 5);
    expect(l).toBeCloseTo(0.5, 5);
  });

  it('treats hue as circular (0.99 is near center 0.0)', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.0, hueWidth: 0.2, hueShift: 0, satScale: 0, lumShift: 0 }];
    const [, s] = applySpectrumBands(0.99, 0.9, 0.5, bands); // dist 0.01 -> inside band
    expect(s).toBeLessThan(0.9);
  });

  it('applies partial effect at the band edge (linear falloff)', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.0, hueWidth: 0.2, hueShift: 0.2, satScale: 1, lumShift: 0 }];
    // hue 0.05 -> dist 0.05, half-width 0.1 -> falloff 0.5 -> hueShift*0.5 = 0.1
    const [h] = applySpectrumBands(0.05, 0.5, 0.5, bands);
    expect(h).toBeCloseTo(0.15, 5);
  });

  it('clamps saturation and luminance to [0,1]', () => {
    const bands: SpectrumSculptBand[] = [{ hueCenter: 0.0, hueWidth: 1, hueShift: 0, satScale: 5, lumShift: 0.9 }];
    const [, s, l] = applySpectrumBands(0.0, 0.5, 0.5, bands);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0);
  });
});
