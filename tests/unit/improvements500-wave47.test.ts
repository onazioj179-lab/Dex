// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  boxBlur,
  gaussianBlurImage,
  prewittEdges,
  scharrEdges,
  robertsCross,
  laplacianEdges,
  unsharpMask,
  medianBlur,
  bilateralFilter,
  histogramEqualize,
} from '../../src/renderer/improvements500';

function constantImage(w: number, h: number, v: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  out.fill(v);
  return out;
}

describe('improvements500 Wave 47', () => {
  it('boxBlur preserves a constant image', () => {
    const img = constantImage(8, 8, 100);
    const out = boxBlur(img, 8, 8, 1);
    for (const v of out) expect(v).toBe(100);
  });

  it('gaussianBlurImage preserves a constant image', () => {
    const img = constantImage(16, 16, 50);
    const out = gaussianBlurImage(img, 16, 16, 1);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(49);
  });

  it('prewitt/scharr/roberts/laplacian return zeros on flat image', () => {
    const img = constantImage(8, 8, 200);
    expect(Math.max(...prewittEdges(img, 8, 8))).toBe(0);
    expect(Math.max(...scharrEdges(img, 8, 8))).toBe(0);
    expect(Math.max(...robertsCross(img, 8, 8))).toBe(0);
    expect(Math.max(...laplacianEdges(img, 8, 8))).toBe(0);
  });

  it('edge detectors light up at a step', () => {
    const w = 8;
    const h = 8;
    const img = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img[y * w + x] = x < 4 ? 0 : 255;
    expect(Math.max(...prewittEdges(img, w, h))).toBeGreaterThan(0);
    expect(Math.max(...scharrEdges(img, w, h))).toBeGreaterThan(0);
  });

  it('unsharpMask returns same shape as input', () => {
    const img = constantImage(4, 4, 100);
    const out = unsharpMask(img, 4, 4, 1, 1);
    expect(out.length).toBe(16);
  });

  it('medianBlur removes single-pixel salt', () => {
    const img = constantImage(5, 5, 100);
    img[12] = 255; // center salt
    const out = medianBlur(img, 5, 5, 1);
    expect(out[12]).toBe(100);
  });

  it('bilateralFilter preserves edges', () => {
    const w = 8;
    const h = 1;
    const img = new Uint8ClampedArray(w);
    for (let i = 0; i < w; i++) img[i] = i < 4 ? 0 : 255;
    const out = bilateralFilter(img, w, h, 2, 16);
    expect(out[0]).toBeLessThan(50);
    expect(out[7]).toBeGreaterThan(200);
  });

  it('histogramEqualize maps ramp to a fuller range', () => {
    const img = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80]);
    const out = histogramEqualize(img);
    expect(out[out.length - 1]).toBe(255);
  });
});
