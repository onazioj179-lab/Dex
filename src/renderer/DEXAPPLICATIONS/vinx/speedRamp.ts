// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Speed-ramp evaluation (pure, unit-tested).
 *
 * A clip's SpeedRamp is a set of {frame, speed} keyframes in CLIP-LOCAL
 * frames. `speedRampAt` returns the effective speed multiplier at a local
 * frame — linear interpolation between keyframes, clamped to the browser's
 * usable playbackRate window. The playback engine multiplies this into each
 * active clip's media playbackRate every tick, so ramps play for real
 * (previously the ramp editor SAVED points that nothing ever read).
 */

import type { SpeedRamp } from './VinxTypes';

/** Browsers reliably honor playbackRate ≈ 0.0625..16; keep a musical window. */
const MIN_SPEED = 0.1;
const MAX_SPEED = 8;

function clampSpeed(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
}

export function speedRampAt(ramp: SpeedRamp | null | undefined, clipLocalFrame: number): number {
  if (!ramp || !ramp.enabled || !ramp.points || ramp.points.length === 0) return 1;
  // Defensive sort — the editor stores points sorted, but don't rely on it.
  const pts = [...ramp.points].sort((a, b) => a.frame - b.frame);
  if (clipLocalFrame <= pts[0].frame) return clampSpeed(pts[0].speed);
  const last = pts[pts.length - 1];
  if (clipLocalFrame >= last.frame) return clampSpeed(last.speed);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (clipLocalFrame >= a.frame && clipLocalFrame <= b.frame) {
      const span = b.frame - a.frame;
      const t = span > 0 ? (clipLocalFrame - a.frame) / span : 0;
      return clampSpeed(a.speed + (b.speed - a.speed) * t);
    }
  }
  return clampSpeed(last.speed);
}
