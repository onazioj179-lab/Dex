// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for Imosion's sidechain ducking curve (computeDuckingCurve):
 * compressor gain law above threshold, unity below, attack/release
 * asymmetry, ratio scaling, and output bounds.
 */
import { describe, it, expect } from 'vitest';
import { computeDuckingCurve } from '../../src/renderer/DEXAPPLICATIONS/imosion/ImosionEngine';

const BIN_HZ = 100;
const params = { thresholdDb: -24, ratio: 4, attackS: 0.003, releaseS: 0.25 };

describe('computeDuckingCurve', () => {
  it('stays at unity gain when the source is below threshold', () => {
    const env = new Float32Array(200).fill(Math.pow(10, -40 / 20)); // -40dB < -24dB
    const curve = computeDuckingCurve(env, params, BIN_HZ);
    for (const g of curve) expect(g).toBeCloseTo(1, 6);
  });

  it('settles to the compressor law gain for a steady over-threshold source', () => {
    // Source at -12dB, threshold -24dB -> 12dB over; ratio 4 -> reduce 9dB.
    const env = new Float32Array(400).fill(Math.pow(10, -12 / 20));
    const curve = computeDuckingCurve(env, params, BIN_HZ);
    const expected = Math.pow(10, -9 / 20); // ≈ 0.3548
    expect(curve[curve.length - 1]).toBeCloseTo(expected, 3);
  });

  it('higher ratio ducks deeper', () => {
    const env = new Float32Array(400).fill(Math.pow(10, -12 / 20));
    const soft = computeDuckingCurve(env, { ...params, ratio: 2 }, BIN_HZ);
    const hard = computeDuckingCurve(env, { ...params, ratio: 10 }, BIN_HZ);
    expect(hard[399]).toBeLessThan(soft[399]);
  });

  it('attacks fast and releases slow (pumping shape)', () => {
    // 1s: kick hit for 100ms starting at bin 100
    const env = new Float32Array(300);
    for (let i = 100; i < 110; i++) env[i] = Math.pow(10, -6 / 20);
    const curve = computeDuckingCurve(env, params, BIN_HZ);
    expect(curve[99]).toBeCloseTo(1, 4);        // before the hit: unity
    expect(curve[109]).toBeLessThan(0.6);       // during: ducked fast (3ms attack)
    // 100ms after the hit ends, the 250ms release has NOT fully recovered
    expect(curve[120]).toBeGreaterThan(curve[109]);
    expect(curve[120]).toBeLessThan(0.95);
    // 2s later it would recover; at the end of this window it's still rising
    expect(curve[299]).toBeGreaterThan(curve[120]);
  });

  it('gain is always within (0, 1]', () => {
    const env = new Float32Array(200).map((_, i) => (i % 7) / 6); // 0..1 sweep
    const curve = computeDuckingCurve(env, { ...params, ratio: 20 }, BIN_HZ);
    for (const g of curve) {
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});
