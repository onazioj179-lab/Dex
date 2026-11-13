// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { DEFAULT_CAMERA, applyCameraView, dofBlur, focalLength, fovZoom, perspectiveScale, MAX_DOF_BLUR } from '../../src/renderer/DEXAPPLICATIONS/flux/fluxCamera';

describe('Flux camera', () => {
  it('50° is the reference lens; narrower zooms in', () => {
    expect(fovZoom(50)).toBeCloseTo(1, 6);
    expect(fovZoom(25)).toBeGreaterThan(2);
    expect(fovZoom(100)).toBeLessThan(0.5);
    expect(fovZoom(Number.NaN)).toBeCloseTo(1, 6);
  });

  it('perspective: same plane = 1, further = smaller, behind = hidden', () => {
    const f = focalLength(50, 1080);
    expect(f).toBeCloseTo(540 / Math.tan((25 * Math.PI) / 180), 3);
    expect(perspectiveScale(0, f)).toBe(1);
    expect(perspectiveScale(f, f)).toBeCloseTo(0.5, 6);
    expect(perspectiveScale(-f / 2, f)).toBeCloseTo(2, 6);
    expect(perspectiveScale(-f, f)).toBeNull();
  });

  it('depth of field blurs away from focus, capped, off when disabled', () => {
    expect(dofBlur(500, DEFAULT_CAMERA)).toBe(0);
    const cam = { ...DEFAULT_CAMERA, dof: true, focusDistance: 300, aperture: 0.02 };
    expect(dofBlur(300, cam)).toBe(0);
    expect(dofBlur(500, cam)).toBe(4);
    expect(dofBlur(100, cam)).toBe(4);
    expect(dofBlur(100000, cam)).toBe(MAX_DOF_BLUR);
  });

  it('a default camera at the frame centre leaves the view unchanged', () => {
    const calls: string[] = [];
    const ctx = {
      translate: (x: number, y: number) => calls.push(`t${x},${y}`),
      rotate: (r: number) => calls.push(`r${r}`),
      scale: (a: number, b: number) => calls.push(`s${a},${b}`),
    };
    applyCameraView(ctx, { x: 960, y: 540, z: 0, roll: 0, zoom: 1, focal: 1000, settings: DEFAULT_CAMERA }, 1920, 1080);
    expect(calls).toEqual(['t960,540', 't-960,-540']);
  });
});
