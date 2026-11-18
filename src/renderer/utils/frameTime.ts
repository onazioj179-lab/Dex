// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Refresh-rate independent motion. Per-frame physics ("velocity *= 0.92 each
// frame") runs twice as fast on a 120 Hz display. These helpers express a step
// in units of a 60 Hz reference frame, so momentum and friction behave the same
// in real time at 60, 90, 120 or 144 Hz.

export const REF_FRAME_MS = 1000 / 60;

/** Elapsed time since `last` in 60 Hz frames (1 on the first frame; clamped so a stall can't teleport). */
export function frameStep(last: number | null | undefined, now: number): number {
  if (last == null || !(now > last)) return 1;
  return Math.min(4, (now - last) / REF_FRAME_MS);
}

/** A per-60Hz-frame factor applied over `step` frames. */
export function decay(factorPerFrame: number, step: number): number {
  return Math.pow(factorPerFrame, step);
}
