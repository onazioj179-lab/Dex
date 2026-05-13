// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  boruvkaMst,
  needlemanWunsch,
  smithWaterman,
  dbscan,
  kMeans,
  agglomerativeCluster,
  hannWindow,
  hammingWindow,
  blackmanWindow,
  blackmanHarrisWindow,
  biquadLowpass,
  BiquadFilter,
  AdsrEnvelope,
  OneEuroFilter,
} from '../../src/renderer/improvements500';

describe('improvements500 wave 35', () => {
  it('boruvkaMst on simple graph', () => {
    const r = boruvkaMst(4, [
      { u: 0, v: 1, weight: 1 },
      { u: 1, v: 2, weight: 2 },
      { u: 2, v: 3, weight: 3 },
      { u: 0, v: 3, weight: 10 },
    ]);
    expect(r.cost).toBe(6);
    expect(r.mst.length).toBe(3);
  });

  it('needlemanWunsch aligns identical', () => {
    const r = needlemanWunsch('GATTACA', 'GCATGCU');
    expect(r.alignedA.length).toBe(r.alignedB.length);
    expect(typeof r.score).toBe('number');
  });

  it('smithWaterman finds local match', () => {
    const r = smithWaterman('XXABCDEFXX', 'YYABCDEFYY');
    expect(r.score).toBeGreaterThan(0);
    expect(r.alignedA).toContain('ABCDEF');
  });

  it('dbscan clusters two groups', () => {
    const pts = [
      [0, 0], [0.1, 0.1], [0.2, 0],
      [10, 10], [10.1, 10], [10, 10.1],
    ];
    const labels = dbscan(pts, { eps: 0.5, minPoints: 2 });
    expect(labels[0]).toBe(labels[1]);
    expect(labels[3]).toBe(labels[5]);
    expect(labels[0]).not.toBe(labels[3]);
  });

  it('kMeans converges on two clusters', () => {
    const pts = [
      [0, 0], [0.1, 0.1], [0.2, 0],
      [10, 10], [10.1, 10], [10, 10.1],
    ];
    const r = kMeans(pts, { k: 2, seed: 42 });
    expect(r.labels[0]).toBe(r.labels[1]);
    expect(r.labels[3]).toBe(r.labels[5]);
    expect(r.labels[0]).not.toBe(r.labels[3]);
  });

  it('agglomerativeCluster yields n-1 merges', () => {
    const pts = [[0], [1], [2], [10]];
    const steps = agglomerativeCluster(pts);
    expect(steps.length).toBe(3);
    expect(steps[0].distance).toBe(1);
  });

  it('window sums match expected', () => {
    expect(hannWindow(8).length).toBe(8);
    expect(hammingWindow(8).length).toBe(8);
    expect(blackmanWindow(8).length).toBe(8);
    expect(blackmanHarrisWindow(8).length).toBe(8);
    const h = hannWindow(8);
    expect(Math.abs(h[0])).toBeLessThan(1e-9);
    expect(Math.abs(h[7])).toBeLessThan(1e-9);
  });

  it('BiquadFilter lowpass passes DC', () => {
    const c = biquadLowpass(48000, 1000, 0.707);
    const f = new BiquadFilter(c);
    let last = 0;
    for (let i = 0; i < 1000; i++) last = f.process(1.0);
    expect(Math.abs(last - 1.0)).toBeLessThan(0.01);
  });

  it('AdsrEnvelope reaches sustain then releases', () => {
    const env = new AdsrEnvelope({ attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 });
    env.trigger();
    for (let i = 0; i < 10; i++) env.process(0.05);
    expect(env.process(0)).toBeCloseTo(0.5, 5);
    env.release();
    for (let i = 0; i < 10; i++) env.process(0.05);
    expect(env.isActive()).toBe(false);
  });

  it('OneEuroFilter smooths a step', () => {
    const f = new OneEuroFilter({ freq: 60, minCutoff: 1.0, beta: 0.0 });
    let v = 0;
    for (let i = 0; i < 60; i++) v = f.filter(1.0);
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThanOrEqual(1.0);
  });
});
