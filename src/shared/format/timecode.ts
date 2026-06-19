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

// -- Drop-frame timecode (NTSC 29.97 / 59.94) -------------------------------
// At the 1000/1001 NTSC rate, non-drop timecode drifts ~3.6s/hour from the wall
// clock. Drop-frame fixes this by SKIPPING `d` frame-NUMBERS (not real frames) at
// the start of every minute except every 10th minute (d = 2 at 30 nominal fps,
// 4 at 60). Convention uses ';' before the frames field. Pure (SMPTE algorithm).
export function framesToDropTimecode(frames: number, nominalFps = 30): string {
  const fps = Math.max(1, Math.round(nominalFps));
  const d = Math.round(nominalFps * 0.0666666); // dropped frame-numbers per minute
  const framesPer10Min = fps * 600 - d * 9;
  const framesPerMin = fps * 60 - d;
  let f = Math.max(0, Math.floor(frames));
  const tenMins = Math.floor(f / framesPer10Min);
  const rem = f % framesPer10Min;
  f += rem > d
    ? d * 9 * tenMins + d * Math.floor((rem - d) / framesPerMin)
    : d * 9 * tenMins;
  const ff = f % fps;
  const ss = Math.floor(f / fps) % 60;
  const mm = Math.floor(f / (fps * 60)) % 60;
  const hh = Math.floor(f / (fps * 3600)) % 24;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
}

/** Parse a drop-frame "HH:MM:SS;FF" (or with ':') to a real frame count, or null. */
export function dropTimecodeToFrames(tc: string, nominalFps = 30): number | null {
  const parts = tc.trim().split(/[:;]/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const fps = Math.max(1, Math.round(nominalFps));
  const [hh, mm, ss, ff] = parts;
  if (mm >= 60 || ss >= 60 || ff >= fps) return null;
  const d = Math.round(nominalFps * 0.0666666);
  const totalMinutes = hh * 60 + mm;
  const dropped = d * (totalMinutes - Math.floor(totalMinutes / 10));
  return ((hh * 3600 + mm * 60 + ss) * fps + ff) - dropped;
}
