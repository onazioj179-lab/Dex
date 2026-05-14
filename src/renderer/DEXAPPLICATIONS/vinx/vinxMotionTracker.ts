// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Vinx motion tracker — real frame-diff feature tracker.
//
// Walks N frames of the active <video> element and follows a feature centroid
// using a small search window + luminance template match (sum of absolute
// differences). Writes plain { frame, x, y, confidence } points so the rest
// of the Vinx pipeline (planar/object stabilization, layer parenting) can
// consume them. Returns a Promise that resolves when the walk completes; the
// caller usually fires-and-forgets it and reads results via store updates.
// =============================================================================

export interface TrackPoint {
  frame: number;
  x: number;
  y: number;
  confidence: number;
}

export interface TrackOptions {
  /** Frames to walk. Positive = forward, negative = backward. Default 30. */
  frames?: number;
  /** Half-size of the template patch (pixels). Default 16. */
  patchHalf?: number;
  /** Half-size of the search window each step. Default 24. */
  searchHalf?: number;
  /** Frame step in seconds (1 / fps). Default 1/30. */
  frameStep?: number;
}

interface Patch {
  data: Uint8ClampedArray;
  size: number;
}

/**
 * Track a feature centered at (startX, startY) on `video` for `frames` frames.
 * If `video.readyState` < 2 the function returns a single anchor point so the
 * caller can still fall back to a static parent.
 */
export async function trackFeature(
  video: HTMLVideoElement,
  startX: number,
  startY: number,
  opts: TrackOptions = {},
): Promise<TrackPoint[]> {
  const frames = opts.frames ?? 30;
  const patchHalf = opts.patchHalf ?? 16;
  const searchHalf = opts.searchHalf ?? 24;
  const frameStep = opts.frameStep ?? (1 / 30);

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || video.readyState < 2) {
    return [{ frame: 0, x: startX, y: startY, confidence: 0 }];
  }

  // Off-screen canvas for sampling the current video frame.
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [{ frame: 0, x: startX, y: startY, confidence: 0 }];

  function grabLuma(): Uint8ClampedArray {
    ctx!.drawImage(video, 0, 0, w, h);
    const img = ctx!.getImageData(0, 0, w, h).data;
    const luma = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < img.length; i += 4, j++) {
      // Rec. 601 luma — fine for tracking, we only care about gradients.
      luma[j] = (img[i] * 76 + img[i + 1] * 150 + img[i + 2] * 29) >> 8;
    }
    return luma;
  }

  function extractPatch(luma: Uint8ClampedArray, cx: number, cy: number): Patch {
    const size = patchHalf * 2 + 1;
    const data = new Uint8ClampedArray(size * size);
    const x0 = Math.max(0, Math.min(w - size, Math.round(cx) - patchHalf));
    const y0 = Math.max(0, Math.min(h - size, Math.round(cy) - patchHalf));
    for (let py = 0; py < size; py++) {
      const src = (y0 + py) * w + x0;
      data.set(luma.subarray(src, src + size), py * size);
    }
    return { data, size };
  }

  function sad(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s;
  }

  function bestMatch(luma: Uint8ClampedArray, template: Patch, cx: number, cy: number): { x: number; y: number; score: number } {
    let bestScore = Infinity;
    let bestX = cx;
    let bestY = cy;
    const half = (template.size - 1) / 2;
    for (let dy = -searchHalf; dy <= searchHalf; dy += 2) {
      for (let dx = -searchHalf; dx <= searchHalf; dx += 2) {
        const nx = Math.round(cx + dx);
        const ny = Math.round(cy + dy);
        if (nx - half < 0 || ny - half < 0 || nx + half >= w || ny + half >= h) continue;
        const candidate = extractPatch(luma, nx, ny);
        const score = sad(candidate.data, template.data);
        if (score < bestScore) { bestScore = score; bestX = nx; bestY = ny; }
      }
    }
    // Confidence: 1 - (sad / max-possible-sad). Saturated to [0,1].
    const maxSad = template.data.length * 255;
    const conf = Math.max(0, Math.min(1, 1 - bestScore / maxSad));
    return { x: bestX, y: bestY, score: conf };
  }

  const direction = frames >= 0 ? 1 : -1;
  const frameCount = Math.abs(frames);
  const points: TrackPoint[] = [];

  // Anchor frame.
  let luma = grabLuma();
  let template = extractPatch(luma, startX, startY);
  let cx = startX, cy = startY;
  points.push({ frame: 0, x: cx, y: cy, confidence: 1 });

  const startTime = video.currentTime;
  for (let f = 1; f < frameCount; f++) {
    const targetTime = startTime + f * direction * frameStep;
    if (targetTime < 0 || targetTime > (video.duration || Infinity)) break;

    // Seek and wait for the frame to land.
    await seekAndWait(video, targetTime);
    luma = grabLuma();
    const match = bestMatch(luma, template, cx, cy);
    cx = match.x; cy = match.y;
    points.push({ frame: f * direction, x: cx, y: cy, confidence: match.score });

    // Drift correction: refresh template every 8 frames so slow appearance
    // changes don't break the match.
    if (f % 8 === 0) template = extractPatch(luma, cx, cy);
  }

  // Restore original playhead.
  try { video.currentTime = startTime; } catch { /* video may have unloaded */ }

  return points;
}

function seekAndWait(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = t; } catch { resolve(); }
    // Hard timeout so a stuck decoder cannot wedge the tracker.
    setTimeout(() => { video.removeEventListener('seeked', onSeeked); resolve(); }, 200);
  });
}
