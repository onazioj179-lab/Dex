// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { avSyncOffset, driftSlope, correctedTime } from '../../src/shared/media/avSync';

describe('media A/V sync (#591)', () => {
  it('finds the alignment lag between two signals', () => {
    const ref = [0, 0, 1, 0, 0, 0];
    const target = [0, 0, 0, 0, 1, 0]; // peak shifted +2
    expect(avSyncOffset(ref, target, 3)).toBe(2);
  });

  it('fits a linear drift slope', () => {
    const ref = [0, 100, 200, 300];
    const target = ref.map((t) => t + 5 + 0.01 * t); // +5 offset, 1% drift
    expect(driftSlope(ref, target)).toBeCloseTo(0.01, 6);
  });

  it('applies offset + drift correction', () => {
    expect(correctedTime(100, 5, 0.01)).toBeCloseTo(106, 6);
  });
});
