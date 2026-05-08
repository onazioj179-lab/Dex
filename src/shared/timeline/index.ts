// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Shared timeline / keyframe primitives.
 *
 * The creative-suite apps (Flux, Vinx, Imosion, Polish) each ship their
 * own Keyframe interface and interpolation code. This module exposes the
 * minimal numeric primitives every one of them needs - easing curves,
 * interval lookup, scalar interpolation - so future depth work in those
 * apps can converge here instead of forking yet another copy.
 *
 * This module is intentionally framework-free: no React, no DOM, no IO.
 * Pure functions only, so it is cheap to test and safe to import from
 * web workers or main-process services.
 */

export type EasingFn = (t: number) => number;

/** Built-in easing curves. All accept t in [0, 1] and return [0, 1]. */
export const Easing = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => {
    const u = t - 1;
    return u * u * u + 1;
  },
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  step: (t: number) => (t >= 1 ? 1 : 0),
} as const;

export type EasingName = keyof typeof Easing;

/** Resolve a name or function to an easing function. Defaults to linear. */
export function resolveEasing(easing?: EasingName | EasingFn | null): EasingFn {
  if (typeof easing === 'function') return easing;
  if (easing && Object.prototype.hasOwnProperty.call(Easing, easing)) {
    return Easing[easing];
  }
  return Easing.linear;
}

/**
 * Minimal keyframe shape the shared primitives operate on.
 * Apps may extend this with their own metadata; only `time` and `value`
 * are required for the math here.
 */
export interface TimelineKeyframe<V = number> {
  /** Time in seconds (or any monotonic unit). */
  time: number;
  /** Value at this keyframe. */
  value: V;
  /** Optional easing applied between this keyframe and the next. */
  easing?: EasingName | EasingFn;
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Linear interpolate between a and b at parameter t in [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Sort keyframes by time ascending. Stable; tolerates undefined input.
 * Returns a new array - does not mutate the input.
 */
export function sortKeyframes<V>(frames: ReadonlyArray<TimelineKeyframe<V>> | null | undefined): TimelineKeyframe<V>[] {
  if (!frames || frames.length === 0) return [];
  return [...frames].sort((a, b) => a.time - b.time);
}

/**
 * Find the active interval [prev, next] for time `t`.
 *
 * - Returns `null` if `frames` is empty.
 * - Before the first keyframe: returns { prev: null, next: frames[0] }.
 * - After the last keyframe:   returns { prev: frames[last], next: null }.
 * - Otherwise: returns the surrounding pair.
 *
 * Frames MUST be sorted ascending by `time`. Use `sortKeyframes` first if not.
 * Uses binary search so this is safe to call per-frame on long timelines.
 */
export function findInterval<V>(
  frames: ReadonlyArray<TimelineKeyframe<V>>,
  t: number,
): { prev: TimelineKeyframe<V> | null; next: TimelineKeyframe<V> | null } | null {
  const n = frames.length;
  if (n === 0) return null;
  if (t <= frames[0].time) return { prev: null, next: frames[0] };
  if (t >= frames[n - 1].time) return { prev: frames[n - 1], next: null };

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid;
  }
  return { prev: frames[lo], next: frames[hi] };
}

/**
 * Sample a numeric timeline at time `t`.
 *
 * - Empty timeline returns `defaultValue` (or 0).
 * - Before the first keyframe: clamps to first value.
 * - After the last keyframe:   clamps to last value.
 * - Between keyframes: applies the prev keyframe's easing then lerps.
 *
 * Frames MUST be sorted ascending. This is the single hot path the
 * creative apps share, so keep it allocation-free.
 */
export function sampleNumber(
  frames: ReadonlyArray<TimelineKeyframe<number>>,
  t: number,
  defaultValue = 0,
): number {
  const interval = findInterval(frames, t);
  if (!interval) return defaultValue;
  const { prev, next } = interval;
  if (prev && !next) return prev.value;
  if (!prev && next) return next.value;
  if (prev && next) {
    const span = next.time - prev.time;
    if (span <= 0) return next.value;
    const raw = (t - prev.time) / span;
    const eased = resolveEasing(prev.easing)(clamp(raw, 0, 1));
    return lerp(prev.value, next.value, eased);
  }
  return defaultValue;
}

/** Total duration covered by the timeline (last - first time). 0 for empty/single. */
export function timelineDuration<V>(frames: ReadonlyArray<TimelineKeyframe<V>>): number {
  if (frames.length < 2) return 0;
  return Math.max(0, frames[frames.length - 1].time - frames[0].time);
}
