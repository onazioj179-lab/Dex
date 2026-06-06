// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Silence-removal timeline mapping (ROADMAP-600 #199). Pure, deterministic
 * frame math that turns the "keep" segments from the silence engine into a set
 * of rippled clip placements on an NLE timeline. Kept separate from the store so
 * the correctness-critical mapping (seconds -> media frames -> timeline frames,
 * honouring clip speed) is fully unit-testable without the editor.
 */

// DEX v6.0 — media: silence -> timeline clip mapping

import type { Region } from './silenceDetect';

export interface ClipFrameRef {
  /** Timeline start frame of the clip. */
  startFrame: number;
  /** Source-media in-point of the clip (frames). */
  mediaInFrame: number;
  /** Playback speed multiplier (1 = normal). */
  speed: number;
}

export interface ClipSegmentSpec {
  startFrame: number;
  endFrame: number;
  mediaInFrame: number;
  mediaOutFrame: number;
}

/**
 * Map keep-segments (seconds, relative to the clip's media in-point) into
 * consecutive (rippled) clip segments. Each segment carries the correct media
 * sub-range; timeline duration is the media duration divided by clip speed.
 * Zero/negative-length segments are dropped.
 */
export function planSilenceClips(
  keep: Region[],
  clip: ClipFrameRef,
  frameRate: number,
): ClipSegmentSpec[] {
  const out: ClipSegmentSpec[] = [];
  if (frameRate <= 0) return out;
  const speed = clip.speed > 0 ? clip.speed : 1;
  let cursor = clip.startFrame;

  for (const seg of keep) {
    const mediaInFrame = clip.mediaInFrame + Math.round(seg.startSec * frameRate);
    const mediaOutFrame = clip.mediaInFrame + Math.round(seg.endSec * frameRate);
    const mediaDur = mediaOutFrame - mediaInFrame;
    if (mediaDur <= 0) continue;
    const timelineDur = Math.max(1, Math.round(mediaDur / speed));
    const startFrame = cursor;
    const endFrame = cursor + timelineDur;
    out.push({ startFrame, endFrame, mediaInFrame, mediaOutFrame });
    cursor = endFrame;
  }
  return out;
}

/** Total timeline frames the rippled result will occupy. */
export function rippledLength(specs: ClipSegmentSpec[]): number {
  if (specs.length === 0) return 0;
  return specs[specs.length - 1].endFrame - specs[0].startFrame;
}
