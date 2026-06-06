// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createMeterState, updateMeter } from '../../src/shared/audio/levelMeter';

describe('audio level meter (#555)', () => {
  it('measures peak/rms and does not clip a -6 dB signal', () => {
    let m = createMeterState();
    m = updateMeter(m, new Float32Array([0.5, -0.5, 0.5, -0.5]));
    expect(m.peak).toBeCloseTo(0.5, 5);
    expect(m.peakDb).toBeCloseTo(-6.0206, 2);
    expect(m.rmsDb).toBeCloseTo(-6.0206, 2);
    expect(m.clip).toBe(false);
  });

  it('latches clip and decays peak-hold', () => {
    let m = createMeterState();
    m = updateMeter(m, new Float32Array([1.0, 1.0]));
    expect(m.clip).toBe(true);
    const hold1 = m.peakHold;
    expect(hold1).toBeCloseTo(1.0, 5);

    m = updateMeter(m, new Float32Array([0, 0]));
    expect(m.clip).toBe(true); // latched
    expect(m.peakHold).toBeCloseTo(hold1 * 0.92, 5);
    expect(m.peakHold).toBeLessThan(hold1);
  });

  it('starts silent', () => {
    const m = createMeterState();
    expect(m.peak).toBe(0);
    expect(m.peakDb).toBe(-Infinity);
    expect(m.clip).toBe(false);
  });
});
