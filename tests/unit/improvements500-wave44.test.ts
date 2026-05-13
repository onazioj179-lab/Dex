// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  viterbi,
  floodFill4,
  connectedComponents4,
  beamSearch,
  sieveOfAtkin,
  ReservoirSamplerK,
  CountingBloomFilter,
  WeightedUnionFind,
  euclideanRhythm,
  forwardBackward,
} from '../../src/renderer/improvements500';

describe('improvements500 Wave 44', () => {
  it('viterbi recovers the obvious sticky-state sequence', () => {
    // Two states, two observations. State 0 always emits 0; state 1 always emits 1.
    const r = viterbi(
      {
        initial: [0.5, 0.5],
        transition: [
          [0.9, 0.1],
          [0.1, 0.9],
        ],
        emission: [
          [1, 0],
          [0, 1],
        ],
      },
      [0, 0, 1, 1],
    );
    expect(r.states).toEqual([0, 0, 1, 1]);
  });

  it('floodFill4 fills a connected region', () => {
    const grid = new Uint8Array([
      1, 1, 0, 0,
      1, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 1,
    ]);
    const filled = floodFill4(grid, 4, 4, 0, 0, 2);
    expect(filled).toHaveLength(4);
    expect(Array.from(grid)).toEqual([
      2, 2, 0, 0,
      2, 2, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 1,
    ]);
  });

  it('connectedComponents4 labels two components', () => {
    const bin = new Uint8Array([
      1, 1, 0, 1,
      1, 0, 0, 1,
      0, 0, 0, 0,
      1, 1, 0, 0,
    ]);
    const r = connectedComponents4(bin, 4, 4);
    expect(r.count).toBe(3);
  });

  it('beamSearch finds best path', () => {
    // Toy: at each step expand into two tokens with log probs -0.1 and -0.5,
    // ending after 3 tokens. Best path is three -0.1 tokens.
    const result = beamSearch<number, number>({
      initial: 0,
      beamWidth: 2,
      maxSteps: 5,
      expand: (_state, tokens) => {
        if (tokens.length >= 3) return [];
        return [
          { state: 0, token: 1, logProb: -0.1, done: tokens.length === 2 },
          { state: 0, token: 0, logProb: -0.5, done: tokens.length === 2 },
        ];
      },
    });
    expect(result[0]!.tokens).toEqual([1, 1, 1]);
    expect(result[0]!.logProb).toBeCloseTo(-0.3, 12);
  });

  it('sieveOfAtkin returns primes up to 30', () => {
    expect(sieveOfAtkin(30)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  });

  it('ReservoirSamplerK retains exactly k items', () => {
    const r = new ReservoirSamplerK<number>(3, () => 0.5);
    for (let i = 0; i < 100; i++) r.push(i);
    expect(r.samples()).toHaveLength(3);
    expect(r.count()).toBe(100);
  });

  it('CountingBloomFilter add/remove/contains', () => {
    const f = new CountingBloomFilter({ capacity: 1000, falsePositiveRate: 0.001 });
    f.add('a');
    f.add('b');
    expect(f.contains('a')).toBe(true);
    expect(f.contains('b')).toBe(true);
    f.remove('a');
    expect(f.contains('a')).toBe(false);
  });

  it('WeightedUnionFind merges and tracks components', () => {
    const uf = new WeightedUnionFind(5);
    expect(uf.components()).toBe(5);
    uf.union(0, 1);
    uf.union(2, 3);
    uf.union(1, 3);
    expect(uf.components()).toBe(2);
    expect(uf.find(0)).toBe(uf.find(2));
    expect(uf.componentSize(0)).toBe(4);
  });

  it('euclideanRhythm distributes pulses evenly', () => {
    expect(euclideanRhythm(8, 3).reduce((a, b) => a + b, 0)).toBe(3);
    expect(euclideanRhythm(8, 3)).toHaveLength(8);
    expect(euclideanRhythm(4, 4)).toEqual([1, 1, 1, 1]);
    expect(euclideanRhythm(4, 0)).toEqual([0, 0, 0, 0]);
  });

  it('forwardBackward gamma rows sum to 1', () => {
    const r = forwardBackward(
      {
        initial: [0.6, 0.4],
        transition: [
          [0.7, 0.3],
          [0.4, 0.6],
        ],
        emission: [
          [0.5, 0.5],
          [0.1, 0.9],
        ],
      },
      [0, 1, 0, 1],
    );
    for (const row of r.gamma) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
    expect(Number.isFinite(r.logLikelihood)).toBe(true);
  });
});
