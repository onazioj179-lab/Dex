// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for Forge's video→WebM planning + the shared dimension helper:
 * computeScaledDimensions (aspect-preserving resize, even-number rounding for
 * video) and isWebmVideoTarget classification.
 */
import { describe, it, expect } from 'vitest';
import { computeScaledDimensions, isWebmVideoTarget } from '../../src/renderer/DEXAPPLICATIONS/forge/transcode';

describe('computeScaledDimensions', () => {
  it('keeps source dimensions when no target given', () => {
    expect(computeScaledDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves aspect from width only', () => {
    expect(computeScaledDimensions(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it('preserves aspect from height only', () => {
    expect(computeScaledDimensions(1920, 1080, undefined, 720)).toEqual({ width: 1280, height: 720 });
  });

  it('uses both axes exactly when both supplied', () => {
    expect(computeScaledDimensions(1920, 1080, 1000, 1000)).toEqual({ width: 1000, height: 1000 });
  });

  it('does not preserve aspect when preserveAspect=false and one axis given', () => {
    expect(computeScaledDimensions(1920, 1080, 1280, undefined, false)).toEqual({ width: 1280, height: 1080 });
  });

  it('rounds to even numbers for video encoders', () => {
    // 1919x1081 scaled: an odd result must be bumped up to even
    const d = computeScaledDimensions(1919, 1081, 641, undefined, true, true);
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
  });

  it('never returns below the minimum (2 when evenOnly, 1 otherwise)', () => {
    expect(computeScaledDimensions(0, 0)).toEqual({ width: 1, height: 1 });
    const even = computeScaledDimensions(0, 0, undefined, undefined, true, true);
    expect(even.width).toBeGreaterThanOrEqual(2);
    expect(even.height).toBeGreaterThanOrEqual(2);
  });

  it('handles a portrait source', () => {
    expect(computeScaledDimensions(1080, 1920, 540)).toEqual({ width: 540, height: 960 });
  });
});

describe('isWebmVideoTarget', () => {
  it('accepts webm/vp9/vp8 spellings, case-insensitive', () => {
    for (const f of ['webm', 'WebM', 'VP9', 'vp9', 'VP8', 'vp9/webm']) {
      expect(isWebmVideoTarget(f)).toBe(true);
    }
  });

  it('rejects non-webm video targets', () => {
    for (const f of ['H.264', 'HEVC', 'ProRes', 'mp4', 'dnxhd', '']) {
      expect(isWebmVideoTarget(f)).toBe(false);
    }
  });
});
