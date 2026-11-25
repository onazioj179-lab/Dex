// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { containRect, upscaleFactor, MIN_UPSCALE } from '../../src/renderer/components/media/VideoEnhance';

describe('video enhance geometry', () => {
  it('fits the video like object-fit: contain (letterbox / pillarbox)', () => {
    expect(containRect(1920, 1080, 960, 960)).toEqual({ x: 0, y: 210, w: 960, h: 540 });
    expect(containRect(1080, 1920, 960, 540)).toEqual({ x: 328.125, y: 0, w: 303.75, h: 540 });
    expect(containRect(0, 0, 960, 540)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('upscales only when the video is smaller than its device-pixel area', () => {
    expect(upscaleFactor(320, 180, 960, 540, 2.25)).toBeCloseTo(6.75);
    expect(upscaleFactor(3840, 2160, 960, 540, 1)).toBeLessThan(MIN_UPSCALE);
    expect(upscaleFactor(1920, 1080, 1920, 1080, 1)).toBeLessThan(MIN_UPSCALE);
  });
});
