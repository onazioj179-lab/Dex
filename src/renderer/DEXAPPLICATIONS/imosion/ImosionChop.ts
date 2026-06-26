// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// IMOSION sample-chop geometry (FL Slicex / Edison style).
//
// Pure, side-effect-free math behind the "Chop" clip action: turn a set of
// clip-relative boundaries into independent slice descriptors. Kept separate
// from the React component so the slicing math is deterministically testable
// without decoding audio or mounting the editor. The live `chopClip` callback
// in Imosion.tsx feeds these the same boundaries it derives from even division
// or transient onset detection.
// =============================================================================

/** Minimal clip geometry the chopper needs — a subset of Imosion's AudioClip. */
export interface ChopSourceClip {
  /** Clip length on the timeline, in seconds. */
  duration: number;
  /** Source-relative start of the clip's audible region, in seconds. */
  trimStart: number;
  /** Clip's position on the timeline, in seconds. */
  startTime: number;
  /** Number of samples in the clip's downsampled waveform preview. */
  waveformLength: number;
}

/** One slice's geometry — everything the live code needs to mint an AudioClip. */
export interface ChopSegment {
  /** Index within the produced slice list (0-based). */
  index: number;
  /** Timeline position of this slice, in seconds. */
  startTime: number;
  /** Length of this slice, in seconds. */
  duration: number;
  /** Source-relative start offset for playback, in seconds. */
  trimStart: number;
  /** Source-relative end offset, in seconds. */
  trimEnd: number;
  /** Inclusive start index into the source waveform preview. */
  wfStart: number;
  /** Exclusive end index into the source waveform preview. */
  wfEnd: number;
}

/** Smallest slice we keep, in seconds — anything shorter is dropped as a sliver. */
export const MIN_SLICE_SEC = 0.01;
/** Clamp on requested even-slice count (UI offers up to 64). */
export const MIN_EVEN_SLICES = 2;
export const MAX_EVEN_SLICES = 64;

/**
 * Even-division boundaries: `slices` equal pieces across `[0, duration]`.
 * Returns `slices + 1` ascending boundaries. The count is clamped to
 * [MIN_EVEN_SLICES, MAX_EVEN_SLICES] to match the chop menu.
 */
export function evenChopBounds(duration: number, slices: number): number[] {
  const n = Math.max(MIN_EVEN_SLICES, Math.min(MAX_EVEN_SLICES, Math.floor(slices)));
  return Array.from({ length: n + 1 }, (_, i) => (duration * i) / n);
}

/**
 * Map clip-relative boundaries to slice descriptors. `bounds` must be ascending
 * seconds within `[0, clip.duration]` (e.g. `[0, ...onsets, duration]` for the
 * transient path, or `evenChopBounds(...)` for even division). Slivers shorter
 * than MIN_SLICE_SEC are skipped, so the returned count can be < bounds-1.
 *
 * Each segment references the SAME source via `trimStart`/`trimEnd`, so the live
 * scheduler plays the correct portion with `source.start(when, trimStart, len)`.
 */
export function computeChopSegments(clip: ChopSourceClip, bounds: number[]): ChopSegment[] {
  const segments: ChopSegment[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const segStart = bounds[i];
    const segLen = bounds[i + 1] - bounds[i];
    if (segLen <= MIN_SLICE_SEC) continue;
    const wfStart = Math.max(0, Math.floor((segStart / clip.duration) * clip.waveformLength));
    const wfEnd = Math.min(clip.waveformLength, Math.ceil((bounds[i + 1] / clip.duration) * clip.waveformLength));
    segments.push({
      index: segments.length,
      startTime: clip.startTime + segStart,
      duration: segLen,
      trimStart: clip.trimStart + segStart,
      trimEnd: clip.trimStart + bounds[i + 1],
      wfStart,
      wfEnd,
    });
  }
  return segments;
}
