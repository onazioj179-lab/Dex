// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  simplifyRatio, ratioLabel, fitSize, heightForWidth, widthForHeight,
} from '../../src/shared/creative/aspectRatio';

describe('aspect ratio', () => {
  it('simplifies ratios', () => {
    expect(simplifyRatio(1920, 1080)).toEqual([16, 9]);
    expect(simplifyRatio(1080, 1080)).toEqual([1, 1]);
    expect(simplifyRatio(1080, 1920)).toEqual([9, 16]);
  });

  it('labels known presets', () => {
    expect(ratioLabel(1920, 1080)).toBe('16:9 (Widescreen)');
    expect(ratioLabel(1080, 1080)).toBe('1:1 (Square)');
    expect(ratioLabel(1234, 567)).toMatch(/^\d+:\d+$/); // unknown -> bare ratio
  });

  it('fits contain (letterbox)', () => {
    // 16:9 source into a square box -> width-limited
    expect(fitSize({ width: 1920, height: 1080 }, { width: 1000, height: 1000 }, 'contain'))
      .toEqual({ width: 1000, height: 563 });
  });

  it('fits cover (crop)', () => {
    expect(fitSize({ width: 1920, height: 1080 }, { width: 1000, height: 1000 }, 'cover'))
      .toEqual({ width: 1778, height: 1000 });
  });

  it('stretch returns the target exactly', () => {
    expect(fitSize({ width: 100, height: 100 }, { width: 640, height: 480 }, 'stretch'))
      .toEqual({ width: 640, height: 480 });
  });

  it('derives a dimension preserving ratio', () => {
    expect(heightForWidth({ width: 1920, height: 1080 }, 1280)).toBe(720);
    expect(widthForHeight({ width: 1920, height: 1080 }, 720)).toBe(1280);
  });

  it('guards zero-size source', () => {
    expect(fitSize({ width: 0, height: 0 }, { width: 100, height: 100 })).toEqual({ width: 0, height: 0 });
  });
});
