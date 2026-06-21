// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Audio — Idea Forge (Riff Machine)
 * -----------------------------------------------------------------------------
 * Generates a melodic riff from a scale + rhythm rules + a seeded RNG — the way
 * real DAW riff generators work (algorithmic, not ML). Notes stay in the chosen
 * scale, walk by small intervals with occasional leaps, and land on a sensible
 * rhythm grid. Pure + deterministic (same inputs + seed -> same riff) so it is
 * unit-testable; the Imosion piano roll calls it to fill notes.
 */

export type RiffScale = 'major' | 'minor' | 'pentatonicMajor' | 'pentatonicMinor' | 'dorian' | 'blues';

export const RIFF_SCALES: RiffScale[] = ['major', 'minor', 'pentatonicMajor', 'pentatonicMinor', 'dorian', 'blues'];

const SCALE_INTERVALS: Record<RiffScale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export interface RiffNote {
  pitch: number;      // MIDI note
  startTime: number;  // beats
  duration: number;   // beats
  velocity: number;   // 0-127
}

export interface RiffOptions {
  /** Tonic MIDI note (e.g. 60 = C4). */
  root: number;
  scale: RiffScale;
  /** Number of 4/4 bars. */
  bars: number;
  /** Note slots per bar (8 = eighths, 16 = sixteenths). Default 8. */
  stepsPerBar?: number;
  /** Probability a slot has a note, 0..1. Default 0.6. */
  density?: number;
  /** Octave span above the root the riff may roam. Default 2. */
  octaves?: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the ascending pool of in-scale MIDI pitches from root across `octaves`. */
export function scalePitches(root: number, scale: RiffScale, octaves: number): number[] {
  const intervals = SCALE_INTERVALS[scale];
  const out: number[] = [];
  for (let o = 0; o <= octaves; o++) {
    for (const iv of intervals) out.push(root + o * 12 + iv);
  }
  return out;
}

/** Generate a melodic riff as a list of notes. Pure + deterministic. */
export function generateRiff(opts: RiffOptions): RiffNote[] {
  const bars = Math.max(1, opts.bars);
  const stepsPerBar = Math.max(1, opts.stepsPerBar ?? 8);
  const density = Math.min(1, Math.max(0, opts.density ?? 0.6));
  const octaves = Math.max(1, opts.octaves ?? 2);
  const rng = mulberry32(opts.seed ?? 1);

  const pool = scalePitches(opts.root, opts.scale, octaves);
  const stepBeats = 4 / stepsPerBar;
  const totalSteps = bars * stepsPerBar;
  const notes: RiffNote[] = [];

  // Start near the lower third of the pool so the riff has room to rise.
  let idx = Math.floor(pool.length / 3);
  for (let s = 0; s < totalSteps; s++) {
    // Always anchor the downbeat of each bar; otherwise honor density.
    const isDownbeat = s % stepsPerBar === 0;
    if (!isDownbeat && rng() >= density) continue;

    // Melodic motion: mostly stepwise (+/-1..2), occasional leap (+/-3..4).
    const leap = rng() < 0.15;
    const stepSize = (leap ? 3 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2)) * (rng() < 0.5 ? -1 : 1);
    idx = Math.max(0, Math.min(pool.length - 1, idx + stepSize));
    if (isDownbeat && s === 0) idx = Math.max(0, Math.min(pool.length - 1, Math.floor(pool.length / 3)));

    // Occasionally hold a note across two slots.
    const dur = stepBeats * (rng() < 0.25 ? 2 : 1);
    notes.push({
      pitch: pool[idx],
      startTime: s * stepBeats,
      duration: dur,
      velocity: 80 + Math.floor(rng() * 30),
    });
  }
  return notes;
}
