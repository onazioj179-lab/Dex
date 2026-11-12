// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Task Manager > Diagnostics: resource history buffer, ranges and the startup waterfall.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushResourceSample, getResourceSamples, resetResourceSamples, samplesInRange, capacityFor,
  summarise, niceCeil, phaseWaterfall, MAX_SAMPLES, SAMPLE_MS,
} from '../../src/renderer/services/diagnostics/resourceHistory';

const sample = (at: number, mem = 300) => ({ at, dexMemMB: mem, dexCpu: 1, sysCpu: 10 });

describe('diagnostics resource history', () => {
  beforeEach(() => resetResourceSamples());

  it('caps the buffer at 15 minutes of samples and keeps the newest', () => {
    for (let i = 0; i < MAX_SAMPLES + 25; i++) pushResourceSample(sample(i * SAMPLE_MS, i));
    const all = getResourceSamples();
    expect(all).toHaveLength(MAX_SAMPLES);
    expect(all[all.length - 1].dexMemMB).toBe(MAX_SAMPLES + 24);
    expect(MAX_SAMPLES).toBe(300);
  });

  it('drops non-finite samples instead of charting zeros', () => {
    pushResourceSample({ at: 1, dexMemMB: Number.NaN, dexCpu: 0, sysCpu: 0 });
    expect(getResourceSamples()).toHaveLength(0);
  });

  it('slices by time range and sizes the chart to the range', () => {
    const now = 1_000_000;
    for (let i = 0; i < 100; i++) pushResourceSample(sample(now - (99 - i) * SAMPLE_MS));
    expect(samplesInRange(getResourceSamples(), 60_000, now)).toHaveLength(21);
    expect(capacityFor(60_000)).toBe(20);
    expect(capacityFor(15 * 60_000)).toBe(300);
  });

  it('summarises a series and rounds chart maxima up', () => {
    expect(summarise([])).toBeNull();
    expect(summarise([2, 4, 6])).toEqual({ min: 2, max: 6, avg: 4, last: 6 });
    expect(niceCeil(300, 128)).toBe(384);
    expect(niceCeil(0, 128)).toBe(128);
  });

  it('lays out startup phases on a shared axis', () => {
    const bars = phaseWaterfall([
      { name: 'native', durationMs: 100, atMs: 100 },
      { name: 'webview', durationMs: 300, atMs: 400 },
      { name: 'bad', durationMs: -1, atMs: 5 },
    ], 400);
    expect(bars.map((b) => b.name)).toEqual(['native', 'webview']);
    expect(bars[0]).toMatchObject({ startPct: 0, widthPct: 25 });
    expect(bars[1]).toMatchObject({ startPct: 25, widthPct: 75 });
  });
});
