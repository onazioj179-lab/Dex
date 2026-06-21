// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Audio — Variant System (clone-and-edit pattern variation)
 * -----------------------------------------------------------------------------
 * Produces a recognizable VARIATION of a step pattern: clone it, then flip a
 * controlled number of cells with a seeded RNG, biased to keep strong beats
 * (downbeats) more stable so the variant still feels like the original. Pure +
 * deterministic (same grid + intensity + seed -> same variant) so it is
 * unit-testable; the Imosion beat sequencer calls it for "Vary".
 */

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
 * Return a clone of `grid` with a controlled number of cells flipped.
 * `intensity` 0..1 scales how much it changes (0 = identical). Downbeats
 * (every 4th column) flip at half the rate so the groove stays recognizable.
 */
export function varyPattern(grid: boolean[][], intensity: number, seed = 1): boolean[][] {
  const amt = Math.min(1, Math.max(0, intensity));
  const rng = mulberry32(seed);
  return grid.map((row) => row.map((cell, c) => {
    const stability = c % 4 === 0 ? 0.5 : 1; // downbeats more stable
    const flipChance = amt * 0.2 * stability;
    return rng() < flipChance ? !cell : cell;
  }));
}

/** Hamming distance (number of differing cells) between two equal-shaped grids. */
export function patternDistance(a: boolean[][], b: boolean[][]): number {
  let d = 0;
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if ((a[r]?.[c] ?? false) !== (b[r]?.[c] ?? false)) d++;
    }
  }
  return d;
}
