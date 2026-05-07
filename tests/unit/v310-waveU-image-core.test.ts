// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX v3.10.0 wave U - image tests
import { describe, expect, it } from 'vitest';
import {
  appendFilter, applyCurve, applyKernel1d, applyRawAdjust, batchProcess, featherMask,
  focusStack, gaussianKernel1d, interpolateFontAxis, medianStack, mergeHdr, patchMatchFill,
  perspectiveTransform, recordAction, removeFilter, separateFrequencies, toneMatchScale,
} from '../../src/shared/image';

describe('wave U image', () => {
  it('smart filter chain append/remove', () => {
    let so = { sourceId: 'src', filters: [] };
    so = appendFilter(so, { id: 'f1', kind: 'blur', params: {} });
    so = appendFilter(so, { id: 'f2', kind: 'sharpen', params: {} });
    expect(so.filters.length).toBe(2);
    expect(removeFilter(so, 'f1').filters.length).toBe(1);
  });
  it('raw exposure brightens', () => {
    const out = applyRawAdjust([0.25, 0.25, 0.25], { exposure: 1 });
    expect(out[0]).toBeCloseTo(0.5, 6);
  });
  it('raw saturation reduces toward luma', () => {
    const out = applyRawAdjust([1, 0, 0], { saturation: -1 });
    expect(out[0]).toBeCloseTo(out[1], 4);
  });
  it('curve linear interpolates', () => {
    expect(applyCurve(0.5, [{input:0,output:0},{input:1,output:1}])).toBe(0.5);
    expect(applyCurve(0.5, [{input:0,output:0},{input:1,output:0.5}])).toBeCloseTo(0.25, 6);
  });
  it('frequency separation sums back to original', () => {
    const img = [1,2,3,4,5,6,7,8];
    const { low, high } = separateFrequencies(img, 1);
    for (let i = 0; i < img.length; i++) expect(low[i] + high[i]).toBeCloseTo(img[i], 6);
  });
  it('perspective identity', () => {
    expect(perspectiveTransform([2, 3], [1,0,0,0,1,0,0,0,1])).toEqual([2, 3]);
  });
  it('tone match scale', () => {
    expect(toneMatchScale(0.5, 1.0)).toBeCloseTo(2, 6);
    expect(toneMatchScale(0, 0.5)).toBe(1);
  });
  it('feather mask blurs', () => {
    const m = [1, 0, 0, 0, 1];
    const f = featherMask(m, 2);
    expect(f[2]).toBeGreaterThan(0);
  });
  it('hdr merge averages by ev', () => {
    const v = mergeHdr([{ value: 0.5, ev: -1 }, { value: 0.5, ev: 1 }]);
    expect(v).toBeGreaterThan(0);
  });
  it('focus stack picks sharpest', () => {
    expect(focusStack([{value:1,sharpness:0.1},{value:2,sharpness:0.9}])).toBe(2);
  });
  it('median stack', () => {
    expect(medianStack([[1,4,7],[2,5,8],[3,6,9]])).toEqual([2,5,8]);
  });
  it('gaussian kernel sums to 1', () => {
    const k = gaussianKernel1d(2, 1);
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('apply kernel preserves length', () => {
    expect(applyKernel1d([1,2,3,4,5], gaussianKernel1d(1, 1)).length).toBe(5);
  });
  it('font axis interpolates', () => {
    expect(interpolateFontAxis(100, 900, 0.5)).toBe(500);
  });
  it('action recorder + batch', () => {
    const rec = recordAction({ steps: [] }, { kind: 'add', params: { n: 1 } });
    const out = batchProcess<number>([1, 2, 3], rec, (it, step) => it + (step.params.n as number));
    expect(out).toEqual([2, 3, 4]);
  });
  it('patchMatch fills holes by neighbours', () => {
    const out = patchMatchFill([1, 0, 0, 0, 5], [1, 2, 3]);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[2]).toBeGreaterThan(0);
  });
});
