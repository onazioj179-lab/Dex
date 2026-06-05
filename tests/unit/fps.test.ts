// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  frameDuration, frameAtTime, timeAtFrame, totalFrames, snapToFrame, stepFrames,
} from '../../src/shared/creative/fps';

describe('fps math', () => {
  it('frame duration and conversions', () => {
    expect(frameDuration(24)).toBeCloseTo(1 / 24, 6);
    expect(frameAtTime(1, 24)).toBe(24);
    expect(frameAtTime(1.5, 24)).toBe(36);
    expect(timeAtFrame(24, 24)).toBe(1);
  });

  it('total frames and snapping', () => {
    expect(totalFrames(2, 24)).toBe(48);
    expect(snapToFrame(1.02, 24)).toBeCloseTo(1, 6);
  });

  it('steps frames with clamping', () => {
    expect(stepFrames(1, 1, 24)).toBeCloseTo(25 / 24, 6);
    expect(stepFrames(0, -5, 24)).toBe(0); // clamp at 0
    expect(stepFrames(10, 100, 24, 10.5)).toBe(10.5); // clamp at duration
  });
});
