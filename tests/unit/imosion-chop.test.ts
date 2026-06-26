// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Imosion sample-chop geometry tests.
 * Verifies the FL Slicex / Edison-style slicing math end-to-end without
 * decoding audio or mounting the editor: even division, transient (arbitrary)
 * boundaries, waveform windowing, and sliver rejection.
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  evenChopBounds,
  computeChopSegments,
  MIN_SLICE_SEC,
  type ChopSourceClip,
} from '../../src/renderer/DEXAPPLICATIONS/imosion/ImosionChop';

const clip = (over: Partial<ChopSourceClip> = {}): ChopSourceClip => ({
  duration: 4,
  trimStart: 0,
  startTime: 0,
  waveformLength: 400,
  ...over,
});

describe('evenChopBounds', () => {
  it('produces N equal pieces as N+1 ascending boundaries', () => {
    const b = evenChopBounds(4, 4);
    expect(b).toEqual([0, 1, 2, 3, 4]);
  });

  it('clamps the slice count to [2, 64]', () => {
    expect(evenChopBounds(4, 1)).toHaveLength(3); // -> 2 slices
    expect(evenChopBounds(4, 0)).toHaveLength(3);
    expect(evenChopBounds(4, 1000)).toHaveLength(65); // -> 64 slices
  });

  it('spans exactly [0, duration]', () => {
    const b = evenChopBounds(7.5, 5);
    expect(b[0]).toBe(0);
    expect(b[b.length - 1]).toBeCloseTo(7.5, 10);
  });
});

describe('computeChopSegments — even division', () => {
  it('slices a 4s clip into 4 contiguous, gap-free seconds', () => {
    const segs = computeChopSegments(clip(), evenChopBounds(4, 4));
    expect(segs).toHaveLength(4);
    expect(segs.map(s => s.duration)).toEqual([1, 1, 1, 1]);
    // Contiguous: each slice starts where the previous ended.
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startTime).toBeCloseTo(segs[i - 1].startTime + segs[i - 1].duration, 10);
    }
  });

  it('windows the waveform preview to match each slice', () => {
    const segs = computeChopSegments(clip({ waveformLength: 400 }), evenChopBounds(4, 4));
    expect(segs.map(s => [s.wfStart, s.wfEnd])).toEqual([
      [0, 100],
      [100, 200],
      [200, 300],
      [300, 400],
    ]);
  });

  it('indexes produced slices sequentially from 0', () => {
    const segs = computeChopSegments(clip(), evenChopBounds(4, 8));
    expect(segs.map(s => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('computeChopSegments — source offsets (trim/startTime)', () => {
  it('keeps trimStart/trimEnd source-relative and startTime timeline-relative', () => {
    // Clip sits at 10s on the timeline and reads from 2s into its source.
    const segs = computeChopSegments(clip({ duration: 2, trimStart: 2, startTime: 10 }), [0, 1, 2]);
    expect(segs[0]).toMatchObject({ startTime: 10, trimStart: 2, trimEnd: 3, duration: 1 });
    expect(segs[1]).toMatchObject({ startTime: 11, trimStart: 3, trimEnd: 4, duration: 1 });
  });
});

describe('computeChopSegments — transient (arbitrary) boundaries', () => {
  it('honors uneven onset boundaries', () => {
    // e.g. [0, ...onsets, duration] from detectOnsets, windowed to the clip.
    const segs = computeChopSegments(clip({ duration: 4, waveformLength: 400 }), [0, 0.5, 2.5, 4]);
    expect(segs.map(s => s.duration)).toEqual([0.5, 2, 1.5]);
    expect(segs.map(s => [s.wfStart, s.wfEnd])).toEqual([
      [0, 50],
      [50, 250],
      [250, 400],
    ]);
  });

  it('drops slivers at or below MIN_SLICE_SEC', () => {
    const tiny = MIN_SLICE_SEC / 2;
    const segs = computeChopSegments(clip({ duration: 4 }), [0, tiny, 2, 4]);
    // The [0, tiny] sliver is rejected; two real slices remain, re-indexed 0,1.
    // The survivor starts at the sliver boundary, so its length is 2 - tiny.
    expect(segs).toHaveLength(2);
    expect(segs.map(s => s.index)).toEqual([0, 1]);
    expect(segs[0].duration).toBeCloseTo(2 - tiny, 10);
    expect(segs[1].duration).toBeCloseTo(2, 10);
  });

  it('clamps waveform window to the preview length', () => {
    const segs = computeChopSegments(clip({ duration: 4, waveformLength: 400 }), [0, 4]);
    expect(segs[0].wfStart).toBe(0);
    expect(segs[0].wfEnd).toBe(400);
  });
});
