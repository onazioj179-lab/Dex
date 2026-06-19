// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Forge's output-file-size estimator (v6 Track G).

import { describe, it, expect } from 'vitest';
import { estimateOutputFileSize } from '../../src/renderer/DEXAPPLICATIONS/forge/ForgeFeatures';

describe('estimateOutputFileSize', () => {
  it('bytes = (videoKbps+audioKbps)*1000*sec/8 * overhead', () => {
    // 10s @ 8000 kbps video, no audio, default 1.05 overhead.
    // bits = 8000*1000*10 = 8e7 -> 1e7 bytes -> *1.05 = 10,500,000.
    expect(estimateOutputFileSize(10, 8000, 0, 1.05)).toBeCloseTo(10_500_000, 0);
  });
  it('adds the audio bitrate', () => {
    // 60s audio-only @ 128 kbps, overhead 1.0 -> 128*1000*60/8 = 960,000.
    expect(estimateOutputFileSize(60, 0, 128, 1)).toBeCloseTo(960_000, 0);
  });
  it('is zero for zero duration and clamps negatives', () => {
    expect(estimateOutputFileSize(0, 8000, 128)).toBe(0);
    expect(estimateOutputFileSize(-5, 8000, 128)).toBe(0);
    expect(estimateOutputFileSize(10, -100, -50)).toBe(0);
  });
});
