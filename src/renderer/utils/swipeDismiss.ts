// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Swipe-to-dismiss gesture maths (banners, sheets). Pure, so it can be tested.
//
// A swipe dismisses when it travels far enough OR is flicked fast enough in the
// dismiss direction (a short quick flick should work, like on a phone). Pulling
// the wrong way gives rubber-band resistance instead of a dead stop.

export interface SwipeSample { x: number; t: number }

/** Fraction of the element's size that dismisses on release regardless of speed. */
export const DISMISS_DISTANCE = 0.4;
/** Release speed (px/ms) that dismisses a short flick. ~0.5 px/ms = 500 px/s. */
export const DISMISS_VELOCITY = 0.5;
/** A flick must still move at least this far, so a tap-jitter never dismisses. */
const MIN_FLICK_PX = 24;
/** Only the last stretch of the gesture counts toward release velocity. */
const VELOCITY_WINDOW_MS = 80;

/** Release velocity in px/ms from recent samples (positive = dismiss direction). */
export function releaseVelocity(samples: readonly SwipeSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** Should a release at offset `dx` with these samples dismiss? */
export function shouldDismiss(dx: number, samples: readonly SwipeSample[], size: number): boolean {
  if (dx >= size * DISMISS_DISTANCE) return true;
  return dx >= MIN_FLICK_PX && releaseVelocity(samples) >= DISMISS_VELOCITY;
}

/**
 * Displayed offset for a raw drag: 1:1 in the dismiss direction, rubber-banded
 * the other way (it gives a little, then stiffens, never more than `max`).
 */
export function rubberBand(dx: number, max = 24): number {
  if (dx >= 0) return dx;
  const d = -dx;
  return -(max * (1 - 1 / (d / max + 1)));
}
