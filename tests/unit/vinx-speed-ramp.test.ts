// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for Vinx's speed-ramp evaluation (speedRampAt): keyframe
 * interpolation, edge clamping, disabled/empty behavior, unsorted input,
 * and the playbackRate safety window.
 */
import { describe, it, expect } from 'vitest';
import { speedRampAt } from '../../src/renderer/DEXAPPLICATIONS/vinx/speedRamp';

const ramp = (points: { frame: number; speed: number }[], enabled = true) => ({
  enabled,
  points: points.map(p => ({ ...p, easing: 'linear' as const })),
});

describe('speedRampAt', () => {
  it('returns 1 for null/disabled/empty ramps', () => {
    expect(speedRampAt(null, 10)).toBe(1);
    expect(speedRampAt(undefined, 10)).toBe(1);
    expect(speedRampAt(ramp([{ frame: 0, speed: 0.5 }], false), 10)).toBe(1);
    expect(speedRampAt({ enabled: true, points: [] }, 10)).toBe(1);
  });

  it('interpolates linearly between keyframes', () => {
    const r = ramp([{ frame: 0, speed: 1 }, { frame: 100, speed: 0.5 }]);
    expect(speedRampAt(r, 0)).toBe(1);
    expect(speedRampAt(r, 50)).toBeCloseTo(0.75, 9);
    expect(speedRampAt(r, 100)).toBe(0.5);
  });

  it('clamps before the first and after the last keyframe', () => {
    const r = ramp([{ frame: 20, speed: 2 }, { frame: 80, speed: 0.5 }]);
    expect(speedRampAt(r, 0)).toBe(2);
    expect(speedRampAt(r, 150)).toBe(0.5);
  });

  it('handles the 1x → slow-mo → 1x preset shape', () => {
    const r = ramp([
      { frame: 0, speed: 1 },
      { frame: 30, speed: 0.5 },
      { frame: 70, speed: 0.5 },
      { frame: 100, speed: 1 },
    ]);
    expect(speedRampAt(r, 15)).toBeCloseTo(0.75, 9);
    expect(speedRampAt(r, 50)).toBe(0.5);   // flat slow-mo plateau
    expect(speedRampAt(r, 85)).toBeCloseTo(0.75, 9);
  });

  it('sorts unsorted keyframes defensively', () => {
    const r = ramp([{ frame: 100, speed: 0.5 }, { frame: 0, speed: 1 }]);
    expect(speedRampAt(r, 50)).toBeCloseTo(0.75, 9);
  });

  it('clamps speeds to the playable window', () => {
    expect(speedRampAt(ramp([{ frame: 0, speed: 0.001 }]), 0)).toBe(0.1);
    expect(speedRampAt(ramp([{ frame: 0, speed: 50 }]), 0)).toBe(8);
    expect(speedRampAt(ramp([{ frame: 0, speed: NaN }]), 0)).toBe(1);
  });
});
