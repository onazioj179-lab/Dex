// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Audio — Session Performer (rule-based drum-pattern generator)
 * -----------------------------------------------------------------------------
 * Generates a musically-structured drum grid from genre rules + a seeded RNG —
 * the way real DAW "auto-drummer"/riff features work (algorithmic, not ML). Pure
 * + deterministic (same genre + seed -> same grid) so it is unit-testable; the
 * Imosion beat sequencer calls it to fill its step grid.
 *
 * Row roles by index (matches a conventional kit order): 0 kick, 1 snare,
 * 2 closed hat, 3 open hat, 4+ light percussion (sparse, seeded).
 */

export type DrumGenre = 'house' | 'rock' | 'hiphop' | 'trap' | 'funk' | 'random';

export const DRUM_GENRES: DrumGenre[] = ['house', 'rock', 'hiphop', 'trap', 'funk', 'random'];

export interface DrumPatternOptions {
  genre: DrumGenre;
  rows: number;
  steps: number;
  /** Deterministic seed (default 1). */
  seed?: number;
}

/** Small deterministic PRNG so generation is reproducible + testable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a `rows x steps` boolean grid of drum hits for `genre`. Patterns are
 * authored on a 16-step bar and scaled to the requested step count.
 */
export function generateDrumPattern(opts: DrumPatternOptions): boolean[][] {
  const rows = Math.max(1, opts.rows);
  const steps = Math.max(1, opts.steps);
  const rng = mulberry32(opts.seed ?? 1);
  const grid: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(steps).fill(false));

  const scale = steps / 16;
  const at = (s16: number) => Math.min(steps - 1, Math.round(s16 * scale));
  const set = (row: number, s16: number) => { if (row >= 0 && row < rows) grid[row][at(s16)] = true; };
  const KICK = 0, SNARE = 1, HAT = 2, OPENHAT = 3;

  switch (opts.genre) {
    case 'house': // four-on-the-floor
      [0, 4, 8, 12].forEach(s => set(KICK, s));
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s += 2) set(HAT, s);
      for (let s = 2; s < 16; s += 4) set(OPENHAT, s);
      break;
    case 'rock':
      [0, 8].forEach(s => set(KICK, s));
      if (rng() < 0.5) set(KICK, 10);
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s += 2) set(HAT, s);
      break;
    case 'hiphop':
      [0, 7, 10].forEach(s => set(KICK, s));
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s += 2) set(HAT, s);
      break;
    case 'trap':
      [0, 10].forEach(s => set(KICK, s));
      if (rng() < 0.5) set(KICK, 6);
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s++) if (s % 2 === 0 || rng() < 0.4) set(HAT, s); // rolls
      break;
    case 'funk':
      [0, 6, 10, 11].forEach(s => set(KICK, s));
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s++) if (rng() < 0.7) set(HAT, s);
      break;
    case 'random':
      for (let s = 0; s < 16; s += 4) if (rng() < 0.9) set(KICK, s);
      [4, 12].forEach(s => set(SNARE, s));
      for (let s = 0; s < 16; s++) if (rng() < 0.5) set(HAT, s);
      break;
  }

  // Light, sparse percussion on any extra rows.
  for (let r = 4; r < rows; r++) {
    for (let s = 0; s < steps; s++) if (rng() < 0.08) grid[r][s] = true;
  }
  return grid;
}
