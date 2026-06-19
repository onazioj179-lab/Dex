// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Vinx drop-frame (NTSC 29.97) timecode (v6 Track G) -- SMPTE algorithm.

import { describe, it, expect } from 'vitest';
import { framesToDropTimecode, dropTimecodeToFrames } from '../../src/shared/format/timecode';

describe('framesToDropTimecode (29.97 NTSC)', () => {
  it('frame 0 is 00:00:00;00', () => {
    expect(framesToDropTimecode(0, 30)).toBe('00:00:00;00');
  });
  it('frame 1800 is 00:01:00;02 (the canonical drop at minute 1)', () => {
    expect(framesToDropTimecode(1800, 30)).toBe('00:01:00;02');
  });
  it('frame 17982 is exactly 00:10:00;00 (no drop at minute 10)', () => {
    expect(framesToDropTimecode(17982, 30)).toBe('00:10:00;00');
  });
});

describe('dropTimecodeToFrames', () => {
  it('inverts the canonical example', () => {
    expect(dropTimecodeToFrames('00:01:00;02', 30)).toBe(1800);
    expect(dropTimecodeToFrames('00:10:00;00', 30)).toBe(17982);
  });
  it('round-trips a range of frame counts', () => {
    for (const n of [0, 1, 29, 1799, 1800, 1801, 17982, 53955, 107892]) {
      expect(dropTimecodeToFrames(framesToDropTimecode(n, 30), 30)).toBe(n);
    }
  });
  it('rejects malformed timecode', () => {
    expect(dropTimecodeToFrames('1:2:3', 30)).toBeNull();
    expect(dropTimecodeToFrames('00:00:99;00', 30)).toBeNull();
    expect(dropTimecodeToFrames('00:00:00;30', 30)).toBeNull(); // ff must be < 30
  });
});
