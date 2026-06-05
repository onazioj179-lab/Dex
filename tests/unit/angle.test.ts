// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { toRadians, toDegrees, normalizeDegrees, shortestDelta, lerpAngle, snapAngle } from '../../src/shared/math/angle';

describe('angle', () => {
  it('converts degrees and radians', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 6);
    expect(toDegrees(Math.PI)).toBeCloseTo(180, 6);
  });

  it('normalizes degrees into [0,360)', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(0)).toBe(0);
  });

  it('shortest delta wraps the circle', () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(shortestDelta(0, 180)).toBe(180);
  });

  it('lerpAngle takes the short way around', () => {
    expect(lerpAngle(350, 10, 0.5)).toBe(0);
  });

  it('snaps to step multiples', () => {
    expect(snapAngle(47, 45)).toBe(45);
    expect(snapAngle(70, 45)).toBe(90);
    expect(snapAngle(123, 0)).toBe(123); // step<=0 unchanged
  });
});
