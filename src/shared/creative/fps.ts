// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Frame-rate math (Vinx/Flux playback + scrubbing). Convert between seconds and
 * frame indices at a frame rate, frame durations, and total frame counts. Pairs
 * with `timecode.ts` (which handles HH:MM:SS:FF display). Pure: no DOM.
 */

/** Duration of one frame in seconds. */
export function frameDuration(fps: number): number {
  return 1 / Math.max(1e-6, fps);
}

/** The frame index containing time `seconds` (0-based, floor). */
export function frameAtTime(seconds: number, fps: number): number {
  return Math.floor(Math.max(0, seconds) * fps);
}

/** The start time (seconds) of frame `frame`. */
export function timeAtFrame(frame: number, fps: number): number {
  return Math.max(0, Math.floor(frame)) / Math.max(1e-6, fps);
}

/** Total frames in a clip of `durationSeconds`. */
export function totalFrames(durationSeconds: number, fps: number): number {
  return Math.max(0, Math.round(durationSeconds * fps));
}

/** Snap a time (seconds) to the nearest frame boundary. */
export function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / Math.max(1e-6, fps);
}

/** Step `n` frames from `seconds`, clamped to [0, duration]. */
export function stepFrames(seconds: number, n: number, fps: number, durationSeconds = Infinity): number {
  const t = timeAtFrame(frameAtTime(seconds, fps) + n, fps);
  return Math.min(durationSeconds, Math.max(0, t));
}
