// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { temperatureOfHue, warmthScore, colorTemperature } from '../../src/shared/creative/colorTemperature';

describe('color temperature', () => {
  it('classifies hues', () => {
    expect(temperatureOfHue(0)).toBe('warm');     // red
    expect(temperatureOfHue(30)).toBe('warm');    // orange
    expect(temperatureOfHue(330)).toBe('warm');   // magenta
    expect(temperatureOfHue(210)).toBe('cool');   // blue
    expect(temperatureOfHue(120)).toBe('cool');   // green
    expect(temperatureOfHue(90)).toBe('neutral'); // yellow-green band
  });

  it('classifies RGB colors, neutral for grays', () => {
    expect(colorTemperature({ r: 255, g: 0, b: 0 })).toBe('warm');
    expect(colorTemperature({ r: 0, g: 0, b: 255 })).toBe('cool');
    expect(colorTemperature({ r: 128, g: 128, b: 128 })).toBe('neutral');
  });

  it('signed warmth score', () => {
    expect(warmthScore({ r: 255, g: 0, b: 0 })).toBeGreaterThan(0);
    expect(warmthScore({ r: 0, g: 0, b: 255 })).toBeLessThan(0);
    expect(warmthScore({ r: 128, g: 128, b: 128 })).toBeCloseTo(0, 1); // gray ≈ 0
  });
});
