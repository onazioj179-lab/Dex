// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { planSilenceClips, rippledLength } from '../../src/shared/media/silenceTimeline';

describe('silenceTimeline.planSilenceClips (#199 timeline mapping)', () => {
  it('ripples kept segments back-to-back with correct media ranges', () => {
    // keep [0,1]s and [2,3]s of a clip at timeline 100, media-in 0, speed 1, 30fps.
    const specs = planSilenceClips(
      [{ startSec: 0, endSec: 1 }, { startSec: 2, endSec: 3 }],
      { startFrame: 100, mediaInFrame: 0, speed: 1 },
      30,
    );
    expect(specs).toHaveLength(2);
    expect(specs[0]).toEqual({ startFrame: 100, endFrame: 130, mediaInFrame: 0, mediaOutFrame: 30 });
    // second kept chunk pulls media 60..90 but sits right after the first (ripple)
    expect(specs[1]).toEqual({ startFrame: 130, endFrame: 160, mediaInFrame: 60, mediaOutFrame: 90 });
    // 2s of kept content out of a 3s clip -> 60 frames total
    expect(rippledLength(specs)).toBe(60);
  });

  it('honours clip speed (2x compresses timeline, not media)', () => {
    const specs = planSilenceClips(
      [{ startSec: 0, endSec: 2 }],
      { startFrame: 0, mediaInFrame: 10, speed: 2 },
      30,
    );
    // media: 10 .. 10+60 = 70 ; timeline duration 60/2 = 30
    expect(specs[0]).toEqual({ startFrame: 0, endFrame: 30, mediaInFrame: 10, mediaOutFrame: 70 });
  });

  it('respects a non-zero media in-point offset', () => {
    const specs = planSilenceClips(
      [{ startSec: 0, endSec: 1 }],
      { startFrame: 50, mediaInFrame: 90, speed: 1 },
      30,
    );
    expect(specs[0].mediaInFrame).toBe(90);
    expect(specs[0].mediaOutFrame).toBe(120);
  });

  it('drops zero-length keep segments and guards bad frame rate', () => {
    expect(planSilenceClips([{ startSec: 1, endSec: 1 }], { startFrame: 0, mediaInFrame: 0, speed: 1 }, 30)).toEqual([]);
    expect(planSilenceClips([{ startSec: 0, endSec: 1 }], { startFrame: 0, mediaInFrame: 0, speed: 1 }, 0)).toEqual([]);
    expect(rippledLength([])).toBe(0);
  });
});
