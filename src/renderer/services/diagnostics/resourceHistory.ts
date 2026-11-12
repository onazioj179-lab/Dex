// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX's own resource history for Task Manager > Diagnostics. Samples come from
 * the native `xenon:selfSample` / `xenon:systemSample` channels while the view
 * is open; the buffer lives at module scope so switching views (which
 * unmounts Diagnostics) keeps the history instead of starting from empty.
 * Numbers only, bounded, never persisted or sent anywhere.
 */

export interface ResourceSample {
  /** Wall-clock time of the sample (ms). */
  at: number;
  /** Memory of all DEX processes, MB. */
  dexMemMB: number;
  /** DEX CPU as a share of this PC, %. */
  dexCpu: number;
  /** Whole-system CPU, %. */
  sysCpu: number;
}

/** Sampling interval of the Diagnostics view (ms). */
export const SAMPLE_MS = 3000;
/** 15 minutes at SAMPLE_MS. */
export const MAX_SAMPLES = Math.ceil((15 * 60 * 1000) / SAMPLE_MS);

export const RANGES = [
  { id: '1m', label: '1 min', ms: 60_000 },
  { id: '5m', label: '5 min', ms: 5 * 60_000 },
  { id: '15m', label: '15 min', ms: 15 * 60_000 },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

let samples: ResourceSample[] = [];

export function pushResourceSample(s: ResourceSample): ResourceSample[] {
  if (![s.at, s.dexMemMB, s.dexCpu, s.sysCpu].every(Number.isFinite)) return samples;
  samples = samples.length >= MAX_SAMPLES ? [...samples.slice(samples.length - MAX_SAMPLES + 1), s] : [...samples, s];
  return samples;
}

export function getResourceSamples(): ResourceSample[] {
  return samples;
}

/** Test hook. */
export function resetResourceSamples(): void {
  samples = [];
}

/** Samples within the last `rangeMs` of `now`. */
export function samplesInRange(all: ResourceSample[], rangeMs: number, now = Date.now()): ResourceSample[] {
  const from = now - rangeMs;
  return all.filter((s) => s.at >= from);
}

/** How many slots a chart of this range needs at SAMPLE_MS. */
export function capacityFor(rangeMs: number): number {
  return Math.max(2, Math.round(rangeMs / SAMPLE_MS));
}

export interface SeriesSummary { min: number; max: number; avg: number; last: number }

export function summarise(values: number[]): SeriesSummary | null {
  if (values.length === 0) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { min, max, avg: sum / values.length, last: values[values.length - 1] };
}

/** Round a chart maximum up to a readable step (MB charts). */
export function niceCeil(v: number, step: number): number {
  if (!Number.isFinite(v) || v <= 0) return step;
  return Math.ceil(v / step) * step;
}

export interface PhaseBar { name: string; startPct: number; widthPct: number; durationMs: number; atMs: number }

/**
 * Lay out native startup phases as a waterfall. `atMs` is when a phase ended
 * (relative to process start) and `durationMs` how long it took, so each bar
 * runs from atMs - durationMs to atMs on a 0..total axis.
 */
export function phaseWaterfall(phases: Array<{ name: string; durationMs: number; atMs: number }>, totalMs?: number): PhaseBar[] {
  const valid = phases.filter((p) => Number.isFinite(p.atMs) && Number.isFinite(p.durationMs) && p.atMs >= 0 && p.durationMs >= 0);
  if (valid.length === 0) return [];
  const total = Math.max(totalMs && totalMs > 0 ? totalMs : 0, ...valid.map((p) => p.atMs), 1);
  return valid.map((p) => {
    const start = Math.max(0, p.atMs - p.durationMs);
    return {
      name: p.name,
      atMs: p.atMs,
      durationMs: p.durationMs,
      startPct: (start / total) * 100,
      // Keep zero-length phases visible as a hairline.
      widthPct: Math.max(0.4, ((p.atMs - start) / total) * 100),
    };
  });
}
