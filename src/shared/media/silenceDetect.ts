// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Silence detection + removal planning (ROADMAP-600 #199 silence removal,
 * #198 smart cuts at silence). A REAL DSP engine — no ML, no external model:
 * sliding-window RMS over PCM samples, threshold in dBFS, merge runs into
 * regions, and plan the keep/remove segments with padding so speech onsets are
 * never clipped. Pure + deterministic, so it's fully unit-testable headlessly;
 * the app decodes a clip to PCM (Web Audio `decodeAudioData`) and feeds it in.
 */

// DEX v6.0 — media: silence detection engine

export interface SilenceDetectOptions {
  /** Level at/under which a window counts as silent, in dBFS. Default -40. */
  thresholdDb?: number;
  /** Minimum duration (s) for a silent run to count as a region. Default 0.35. */
  minSilenceSec?: number;
  /** RMS analysis window (s). Default 0.02 (20 ms). */
  windowSec?: number;
  /** Keep this much (s) of audio either side of speech. Default 0.05. */
  paddingSec?: number;
}

export interface Region {
  startSec: number;
  endSec: number;
}

export interface SilencePlan {
  /** Non-silent segments to keep (silence trimmed, padding applied). */
  keep: Region[];
  /** Silent segments to cut. */
  remove: Region[];
  removedSec: number;
  keptSec: number;
  originalSec: number;
}

const EPS = 1e-12;

/** RMS of samples[from, to) → dBFS (−Infinity for pure silence). */
function windowDb(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  const n = Math.max(1, to - from);
  const rms = Math.sqrt(sum / n);
  if (rms <= EPS) return -Infinity;
  return 20 * Math.log10(rms);
}

/**
 * Detect silent regions in mono PCM. Returns regions in seconds, in order,
 * each at least `minSilenceSec` long and at/under `thresholdDb`.
 */
export function detectSilence(
  samples: Float32Array,
  sampleRate: number,
  opts: SilenceDetectOptions = {},
): Region[] {
  const thresholdDb = opts.thresholdDb ?? -40;
  const minSilenceSec = Math.max(0, opts.minSilenceSec ?? 0.35);
  const windowSec = Math.max(0.001, opts.windowSec ?? 0.02);
  if (!samples || samples.length === 0 || sampleRate <= 0) return [];

  const win = Math.max(1, Math.round(windowSec * sampleRate));
  const regions: Region[] = [];
  let runStart = -1; // sample index where the current silent run began

  const flush = (endSample: number) => {
    if (runStart < 0) return;
    const startSec = runStart / sampleRate;
    const endSec = endSample / sampleRate;
    if (endSec - startSec >= minSilenceSec) regions.push({ startSec, endSec });
    runStart = -1;
  };

  for (let i = 0; i < samples.length; i += win) {
    const end = Math.min(samples.length, i + win);
    const db = windowDb(samples, i, end);
    const silent = db <= thresholdDb;
    if (silent) {
      if (runStart < 0) runStart = i;
    } else {
      flush(i);
    }
  }
  flush(samples.length);
  return regions;
}

/** Subtract `remove` regions from [0, total] → the complementary keep regions. */
function complement(remove: Region[], totalSec: number): Region[] {
  const keep: Region[] = [];
  let cursor = 0;
  for (const r of remove) {
    if (r.startSec > cursor) keep.push({ startSec: cursor, endSec: r.startSec });
    cursor = Math.max(cursor, r.endSec);
  }
  if (cursor < totalSec) keep.push({ startSec: cursor, endSec: totalSec });
  return keep;
}

/**
 * Plan a silence-removal edit: detect silence, shrink each silent region by
 * `paddingSec` on both ends (so speech is never clipped), drop anything that
 * shrinks away, then derive the keep/remove segments and durations.
 */
export function planSilenceRemoval(
  samples: Float32Array,
  sampleRate: number,
  opts: SilenceDetectOptions = {},
): SilencePlan {
  const padding = Math.max(0, opts.paddingSec ?? 0.05);
  const originalSec = samples && sampleRate > 0 ? samples.length / sampleRate : 0;

  const raw = detectSilence(samples, sampleRate, opts);
  const remove: Region[] = [];
  for (const r of raw) {
    const startSec = r.startSec + padding;
    const endSec = r.endSec - padding;
    if (endSec - startSec > 0) remove.push({ startSec, endSec });
  }

  const keep = complement(remove, originalSec);
  const removedSec = remove.reduce((s, r) => s + (r.endSec - r.startSec), 0);
  const keptSec = Math.max(0, originalSec - removedSec);
  return { keep, remove, removedSec, keptSec, originalSec };
}

/** Convenience: pull mono PCM from a decoded AudioBuffer-like object. */
export function toMonoPCM(
  channels: ReadonlyArray<Float32Array>,
  length: number,
): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(length);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < length; i++) out[i] += ch[i] / channels.length;
  }
  return out;
}
