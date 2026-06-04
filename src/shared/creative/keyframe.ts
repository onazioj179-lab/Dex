// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Keyframe interpolation (Flux animation, CRT-143). Evaluates a numeric
 * property animated by keyframes at an arbitrary time, with optional per-segment
 * easing applied to the local progress. Holds at the endpoints (no extrapolation).
 * Pure: no DOM, no IO.
 */

export interface Keyframe {
  /** Time (ms or frames — caller's unit). */
  t: number;
  value: number;
  /** Optional easing for the segment *leaving* this keyframe (progress 0..1 → 0..1). */
  ease?: (x: number) => number;
}

/** Value of the animated property at time `t`. Empty → 0; single key → its value. */
export function interpolateAt(keyframes: readonly Keyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  const keys = [...keyframes].sort((a, b) => a.t - b.t);

  if (t <= keys[0].t) return keys[0].value;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.value;

  // Find the surrounding segment.
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      let frac = span === 0 ? 0 : (t - a.t) / span;
      if (a.ease) frac = a.ease(frac);
      return a.value + (b.value - a.value) * frac;
    }
  }
  return last.value;
}

/** Sample the animation across `steps` evenly-spaced times in [start, end]. */
export function sampleRange(keyframes: readonly Keyframe[], start: number, end: number, steps: number): number[] {
  if (steps <= 0) return [];
  if (steps === 1) return [interpolateAt(keyframes, start)];
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = start + ((end - start) * i) / (steps - 1);
    out.push(interpolateAt(keyframes, t));
  }
  return out;
}

/** The [min,max] time bounds of a keyframe set, or null when empty. */
export function keyframeBounds(keyframes: readonly Keyframe[]): [number, number] | null {
  if (keyframes.length === 0) return null;
  let min = Infinity, max = -Infinity;
  for (const k of keyframes) { if (k.t < min) min = k.t; if (k.t > max) max = k.t; }
  return [min, max];
}
