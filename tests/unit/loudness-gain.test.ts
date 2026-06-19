// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies the true-peak-safe loudness-target gain (v6 Track G) used by Vinx.

import { describe, it, expect } from 'vitest';
import { loudnessTargetGain } from '../../src/shared/audio/dsp';

describe('loudnessTargetGain', () => {
  it('returns the plain delta when there is enough true-peak headroom', () => {
    // -23 LUFS -> -16 target = +7 dB; peak -10 dBTP + 7 = -3 dBTP (under -1) -> no clamp.
    const r = loudnessTargetGain(-23, -16, -10);
    expect(r.gainDb).toBeCloseTo(7, 6);
    expect(r.clampedForTruePeak).toBe(false);
  });

  it('clamps the gain so the true peak never exceeds the ceiling', () => {
    // -20 -> -14 = +6 dB, but peak -3 + 6 = +3 dBTP would clip. Clamp to reach -1 dBTP.
    const r = loudnessTargetGain(-20, -14, -3);
    expect(r.gainDb).toBeCloseTo(2, 6);        // -1 - (-3)
    expect(r.truePeakAfterDb).toBeCloseTo(-1, 6);
    expect(r.clampedForTruePeak).toBe(true);
  });

  it('attenuates (negative gain) without clamping when lowering loudness', () => {
    const r = loudnessTargetGain(-10, -14, -1);
    expect(r.gainDb).toBeCloseTo(-4, 6);
    expect(r.clampedForTruePeak).toBe(false);
  });
});
