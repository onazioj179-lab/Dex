// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Video timecode conversion (Vinx) — frames ↔ "HH:MM:SS:FF" at a given frame
 * rate, plus seconds helpers. Non-drop-frame (the common case for editing
 * displays). Pure: no DOM, no IO.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Convert a whole frame count to "HH:MM:SS:FF" at `fps`. */
export function framesToTimecode(frames: number, fps: number): string {
  const f = Math.max(0, Math.floor(frames));
  const rate = Math.max(1, Math.round(fps));
  const totalSeconds = Math.floor(f / rate);
  const ff = f % rate;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}

/** Parse "HH:MM:SS:FF" (or "MM:SS:FF") to a frame count at `fps`, or null. */
export function timecodeToFrames(tc: string, fps: number): number | null {
  const parts = tc.trim().split(':').map((p) => Number(p));
  if (parts.length < 3 || parts.length > 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  const rate = Math.max(1, Math.round(fps));
  const [hh, mm, ss, ff] = parts.length === 4 ? parts : [0, ...parts];
  if (ss >= 60 || mm >= 60 || ff >= rate) return null;
  return ((hh * 3600 + mm * 60 + ss) * rate) + ff;
}

/** Seconds (float) to a frame count at `fps`. */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(Math.max(0, seconds) * Math.max(1, Math.round(fps)));
}

/** Frame count to seconds (float) at `fps`. */
export function framesToSeconds(frames: number, fps: number): number {
  return Math.max(0, Math.floor(frames)) / Math.max(1, Math.round(fps));
}

/** Seconds (float) directly to "HH:MM:SS:FF". */
export function secondsToTimecode(seconds: number, fps: number): string {
  return framesToTimecode(secondsToFrames(seconds, fps), fps);
}
