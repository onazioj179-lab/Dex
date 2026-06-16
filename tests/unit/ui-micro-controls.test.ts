// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pure-helper coverage for the sharp micro-controls. DOM-free: only the value
// math (clamp / snapToStep / valueToPercent / ratioToValue / the stepper clamp).
import { describe, it, expect } from 'vitest';
import {
  clamp,
  snapToStep,
  valueToPercent,
  ratioToValue,
  roundToStepPrecision,
  stepDecimals,
} from '../../src/renderer/ui/controlMath';
import { clampStepper } from '../../src/renderer/ui/NumberStepper';

describe('controlMath.clamp', () => {
  it('returns the value when in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below min and above max', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
  it('returns the bound exactly at the edges', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('tolerates swapped bounds', () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-1, 10, 0)).toBe(0);
    expect(clamp(99, 10, 0)).toBe(10);
  });
});

describe('controlMath.snapToStep', () => {
  it('snaps to the nearest multiple of step', () => {
    expect(snapToStep(7, 5)).toBe(5);
    expect(snapToStep(8, 5)).toBe(10);
  });
  it('anchors the grid at min', () => {
    // min=1, step=2 -> valid stops are 1, 3, 5, ...
    expect(snapToStep(4, 2, 1)).toBe(5);
    expect(snapToStep(3.4, 2, 1)).toBe(3);
  });
  it('handles fractional steps without float drift', () => {
    expect(snapToStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(snapToStep(0.26, 0.25)).toBe(0.25);
    expect(snapToStep(0.13, 0.25)).toBe(0.25);
    expect(snapToStep(0.12, 0.25)).toBe(0);
  });
  it('passes values through unchanged in continuous mode', () => {
    expect(snapToStep(3.14159, 0)).toBe(3.14159);
    expect(snapToStep(3.14159, NaN)).toBe(3.14159);
    expect(snapToStep(3.14159, -1)).toBe(3.14159);
  });
});

describe('controlMath.valueToPercent', () => {
  it('maps endpoints and midpoint', () => {
    expect(valueToPercent(0, 0, 100)).toBe(0);
    expect(valueToPercent(50, 0, 100)).toBe(50);
    expect(valueToPercent(100, 0, 100)).toBe(100);
  });
  it('works with a non-zero min', () => {
    expect(valueToPercent(10, 10, 20)).toBe(0);
    expect(valueToPercent(15, 10, 20)).toBe(50);
    expect(valueToPercent(20, 10, 20)).toBe(100);
  });
  it('clamps out-of-range values onto the track', () => {
    expect(valueToPercent(-10, 0, 100)).toBe(0);
    expect(valueToPercent(250, 0, 100)).toBe(100);
  });
  it('collapses a zero-width range to 0 (no divide-by-zero)', () => {
    expect(valueToPercent(5, 5, 5)).toBe(0);
    expect(Number.isFinite(valueToPercent(5, 5, 5))).toBe(true);
  });
});

describe('controlMath.ratioToValue', () => {
  it('is the inverse of a percentage, stepped and clamped', () => {
    expect(ratioToValue(0, 0, 100, 1)).toBe(0);
    expect(ratioToValue(0.5, 0, 100, 1)).toBe(50);
    expect(ratioToValue(1, 0, 100, 1)).toBe(100);
  });
  it('snaps to step on the way back', () => {
    expect(ratioToValue(0.5, 0, 10, 2)).toBe(6);
    expect(ratioToValue(0.27, 0, 10, 5)).toBe(5);
  });
  it('clamps ratios outside 0..1', () => {
    expect(ratioToValue(-2, 0, 100, 1)).toBe(0);
    expect(ratioToValue(5, 0, 100, 1)).toBe(100);
  });
});

describe('controlMath.roundToStepPrecision / stepDecimals', () => {
  it('reports the decimal places a step implies', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(0.1)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(0)).toBe(0);
  });
  it('rounds to the step precision', () => {
    expect(roundToStepPrecision(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundToStepPrecision(2.005, 0.01)).toBeCloseTo(2.0, 5);
    expect(roundToStepPrecision(7.9, 1)).toBe(8);
  });
});

describe('NumberStepper.clampStepper', () => {
  it('clamps and snaps a value to the field constraints', () => {
    expect(clampStepper(7, 0, 10, 1)).toBe(7);
    expect(clampStepper(-5, 0, 10, 1)).toBe(0);
    expect(clampStepper(50, 0, 10, 1)).toBe(10);
  });
  it('snaps to step within the range', () => {
    expect(clampStepper(7, 0, 10, 5)).toBe(5);
    expect(clampStepper(8, 0, 10, 5)).toBe(10);
  });
  it('falls back to a clamped 0 for non-finite input', () => {
    expect(clampStepper(NaN, 0, 10, 1)).toBe(0);
    expect(clampStepper(Infinity, 0, 10, 1)).toBe(10);
    // When 0 is below min, the fallback is pulled up to min.
    expect(clampStepper(NaN, 3, 10, 1)).toBe(3);
  });
  it('supports unbounded fields (Infinity bounds)', () => {
    expect(clampStepper(123.456, -Infinity, Infinity, 0)).toBe(123.456);
  });
});
