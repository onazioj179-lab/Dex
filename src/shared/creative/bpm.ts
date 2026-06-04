// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tempo math (Imosion — metronome, grid, quantize). Convert between beats, bars
 * and milliseconds for a BPM and time signature, and quantize a time to the
 * nearest beat subdivision. Pure: no DOM, no AudioContext.
 */

/** Milliseconds per beat at `bpm`. */
export function msPerBeat(bpm: number): number {
  return 60_000 / Math.max(1e-6, bpm);
}

/** Beats → milliseconds. */
export function beatsToMs(beats: number, bpm: number): number {
  return beats * msPerBeat(bpm);
}

/** Milliseconds → beats. */
export function msToBeats(ms: number, bpm: number): number {
  return ms / msPerBeat(bpm);
}

/** Duration of one bar in ms (default 4 beats/bar). */
export function barDurationMs(bpm: number, beatsPerBar = 4): number {
  return beatsPerBar * msPerBeat(bpm);
}

/**
 * Quantize a time (ms) to the nearest beat subdivision. `division` is beats per
 * grid step's denominator: 1 = whole beats, 2 = 1/2-beat, 4 = 1/4-beat, etc.
 */
export function quantizeToBeat(ms: number, bpm: number, division = 1): number {
  const step = msPerBeat(bpm) / Math.max(1, division);
  return Math.round(ms / step) * step;
}

/** The beat index (0-based) that `ms` falls on. */
export function beatAt(ms: number, bpm: number): number {
  return Math.floor(msToBeats(ms, bpm));
}
