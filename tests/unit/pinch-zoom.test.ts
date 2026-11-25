// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { zoomForWheel } from '../../src/renderer/hooks/usePinchZoom';

describe('pinch / wheel zoom', () => {
  it('pinch out zooms in proportionally, pinch in zooms out', () => {
    expect(zoomForWheel(1, -10, 0, true, 0.5, 8)).toBeCloseTo(Math.exp(0.1), 5);
    expect(zoomForWheel(2, 10, 0, true, 0.5, 8)).toBeLessThan(2);
  });
  it('a plain wheel notch is a gentle step', () => {
    const z = zoomForWheel(1, -100, 0, false, 0.5, 8);
    expect(z).toBeGreaterThan(1.1);
    expect(z).toBeLessThan(1.25);
  });
  it('line-mode wheels and limits', () => {
    expect(zoomForWheel(1, -3, 1, false, 0.5, 8)).toBeGreaterThan(1);
    expect(zoomForWheel(7.9, -1000, 0, true, 0.5, 8)).toBe(8);
    expect(zoomForWheel(0.6, 1000, 0, true, 0.5, 8)).toBe(0.5);
  });
});
