// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Media-to-clip construction.
 * Shared, pure helpers for turning a MediaItem from the browser into a timeline
 * Clip. Used by both the drag-and-drop drop handler (Timeline) and the
 * double-click "insert at playhead" path (MediaBrowser) so the two routes build
 * identical clips. No store access here -- callers pass in what they have and
 * insert the returned clip through the normal command pipeline (undoable).
 */

import type { Clip, MediaItem, Track, VinxSequence } from './VinxTypes';
import { generateId } from './VinxTypes';

/** Default clip length (frames) when a media item has no measurable duration
 *  (e.g. a still image, or media whose metadata has not been probed yet). */
export const DEFAULT_STILL_FRAMES = 150;

/** A clip color per media type so dropped clips read at a glance on the timeline. */
function clipColorForType(type: MediaItem['type']): string {
  switch (type) {
    case 'audio': return '#3DAF72';
    case 'image': return '#D4853A';
    case 'video':
    default: return '#4A9EFF';
  }
}

/** Map a media item's type onto the Clip union ('image' lives on a video track
 *  as a video clip). */
function clipTypeForMedia(type: MediaItem['type']): Clip['type'] {
  return type === 'audio' ? 'audio' : 'video';
}

/** The track type a given media item belongs on. */
export function trackTypeForMedia(type: MediaItem['type']): Track['type'] {
  return type === 'audio' ? 'audio' : 'video';
}

/**
 * How many frames a media item should occupy on the timeline, given the project
 * frame rate. Falls back to DEFAULT_STILL_FRAMES for zero-duration media.
 */
export function mediaDurationFrames(media: MediaItem, projectFrameRate: number): number {
  if (media.duration > 0) {
    const fr = projectFrameRate > 0 ? projectFrameRate : 30;
    return Math.max(1, Math.round(media.duration * fr));
  }
  return DEFAULT_STILL_FRAMES;
}

/**
 * Build a full Clip for `media` placed on `trackId` starting at `startFrame`.
 * Every field of the Clip shape is populated so the clip is immediately valid
 * for the renderer, inspector, and exporter (mirrors the adjustment-layer
 * template in the store).
 */
export function buildClipFromMedia(
  media: MediaItem,
  trackId: string,
  startFrame: number,
  projectFrameRate: number,
): Clip {
  const lengthFrames = mediaDurationFrames(media, projectFrameRate);
  const start = Math.max(0, Math.round(startFrame));
  return {
    id: generateId('clip'),
    mediaId: media.id,
    trackId,
    type: clipTypeForMedia(media.type),
    startFrame: start,
    endFrame: start + lengthFrames,
    mediaInFrame: 0,
    mediaOutFrame: lengthFrames,
    name: media.name,
    color: clipColorForType(media.type),
    speed: 1,
    reverse: false,
    opacity: 1,
    volume: 1,
    pan: 0,
    muted: false,
    transform: {
      positionX: 0, positionY: 0, scaleX: 1, scaleY: 1,
      scaleLinked: true, rotation: 0, anchorX: 0.5, anchorY: 0.5,
    },
    effects: [],
    transitionIn: null,
    transitionOut: null,
    keyframes: [],
    titleData: null,
    linkedClipId: null,
    speedRamp: null,
    masks: [],
    compoundClipId: null,
    noiseReduction: null,
    stabilization: null,
    isFreezeFrame: false,
    freezeFrameSource: 0,
    colorGrading: null,
    multicamClipId: null,
  };
}

/**
 * Pick the track a media item should drop onto.
 *
 * `preferredTrackId` is the track the user actually dropped on. If that track's
 * type matches the media (video/image -> video, audio -> audio) it is used as
 * is. Otherwise the first compatible track in the sequence is chosen so audio
 * never lands on a video track (and vice-versa). Returns null when the sequence
 * has no compatible track.
 */
export function resolveDropTrack(
  sequence: VinxSequence,
  media: MediaItem,
  preferredTrackId: string | null,
): Track | null {
  const wantType = trackTypeForMedia(media.type);
  if (preferredTrackId) {
    const preferred = sequence.tracks.find(t => t.id === preferredTrackId);
    if (preferred && preferred.type === wantType && !preferred.locked) return preferred;
  }
  return sequence.tracks.find(t => t.type === wantType && !t.locked) ?? null;
}

/**
 * Frame at which a newly inserted clip should start on `track` so it appends
 * after the last existing clip (no overlap). Used by the double-click
 * insert-at-end path.
 */
export function appendFrameForTrack(track: Track): number {
  let maxEnd = 0;
  for (const c of track.clips) {
    if (c.endFrame > maxEnd) maxEnd = c.endFrame;
  }
  return maxEnd;
}
