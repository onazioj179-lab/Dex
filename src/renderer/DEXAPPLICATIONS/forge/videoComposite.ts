// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * FORGE frame compositing for the in-app WebM encoder: re-framing to an aspect
 * ratio (crop to fill, or pad to fit), a text or image watermark, and burned-in
 * subtitles. The geometry is pure (tested); `drawComposite` applies it to a
 * canvas once per frame.
 */

export type AspectRatio = 'free' | '16:9' | '4:3' | '1:1' | '9:16';
export type FrameMode = 'crop' | 'pad';
export type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface Rect { x: number; y: number; w: number; h: number }

export interface WatermarkSpec {
  type: 'text' | 'image';
  text?: string;
  /** Loaded image for type 'image'. */
  image?: CanvasImageSource & { width: number; height: number };
  /** 0..100 */
  opacity: number;
  position: WatermarkPosition;
}

export interface SubtitleCue { start: number; end: number; text: string }
export interface SubtitleSpec {
  cues: SubtitleCue[];
  font: string;
  /** Font size in px at 720 p output; scaled to the real output height. */
  size: number;
  position: 'Bottom' | 'Top' | 'Center';
  style: 'Outline' | 'Shadow' | 'Box';
}

export interface CompositeSpec {
  aspect?: AspectRatio;
  mode?: FrameMode;
  padColor?: string;
  watermark?: WatermarkSpec | null;
  subtitles?: SubtitleSpec | null;
}

export function aspectValue(a: AspectRatio | undefined): number | null {
  switch (a) {
    case '16:9': return 16 / 9;
    case '4:3': return 4 / 3;
    case '1:1': return 1;
    case '9:16': return 9 / 16;
    default: return null;
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Output size for a re-frame: keep the scaled height, set width from the ratio. */
export function framedOutputSize(scaledW: number, scaledH: number, aspect: AspectRatio | undefined): { width: number; height: number } {
  const r = aspectValue(aspect);
  if (!r) return { width: scaledW, height: scaledH };
  return { width: even(scaledH * r), height: even(scaledH) };
}

/**
 * Where the source goes on the output frame.
 * crop: the largest centred source region with the output's ratio fills the frame.
 * pad:  the whole source is fitted inside the frame, centred; the rest is padding.
 */
export function frameRects(srcW: number, srcH: number, outW: number, outH: number, mode: FrameMode): { src: Rect; dst: Rect } {
  const outR = outW / outH;
  const srcR = srcW / srcH;
  if (mode === 'crop') {
    if (srcR > outR) {
      const w = srcH * outR;
      return { src: { x: (srcW - w) / 2, y: 0, w, h: srcH }, dst: { x: 0, y: 0, w: outW, h: outH } };
    }
    const h = srcW / outR;
    return { src: { x: 0, y: (srcH - h) / 2, w: srcW, h }, dst: { x: 0, y: 0, w: outW, h: outH } };
  }
  if (srcR > outR) {
    const h = outW / srcR;
    return { src: { x: 0, y: 0, w: srcW, h: srcH }, dst: { x: 0, y: (outH - h) / 2, w: outW, h } };
  }
  const w = outH * srcR;
  return { src: { x: 0, y: 0, w: srcW, h: srcH }, dst: { x: (outW - w) / 2, y: 0, w, h: outH } };
}

/** Top-left corner for a box of size w x h at a watermark position, with a margin. */
export function anchorBox(pos: WatermarkPosition, outW: number, outH: number, w: number, h: number, margin: number): { x: number; y: number } {
  const left = margin, right = outW - margin - w, cx = (outW - w) / 2;
  const top = margin, bottom = outH - margin - h, cy = (outH - h) / 2;
  switch (pos) {
    case 'top-left': return { x: left, y: top };
    case 'top-center': return { x: cx, y: top };
    case 'top-right': return { x: right, y: top };
    case 'bottom-left': return { x: left, y: bottom };
    case 'center': return { x: cx, y: cy };
    default: return { x: right, y: bottom };
  }
}

/** The cue showing at time t (seconds), or null. Cues may be unsorted. */
export function activeCue(cues: SubtitleCue[], t: number): SubtitleCue | null {
  for (const c of cues) if (t >= c.start && t < c.end) return c;
  return null;
}

/** Draw one composited frame: background/padding, the source, watermark, subtitle. */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number, srcH: number, outW: number, outH: number,
  spec: CompositeSpec, timeSec: number,
): void {
  const mode: FrameMode = spec.aspect && spec.aspect !== 'free' ? (spec.mode ?? 'crop') : 'crop';
  const { src, dst } = frameRects(srcW, srcH, outW, outH, mode);
  if (mode === 'pad') {
    ctx.fillStyle = spec.padColor || '#000000';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(source, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);

  const scale = outH / 720;
  const margin = Math.round(24 * scale);

  const wm = spec.watermark;
  if (wm) {
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, wm.opacity / 100));
    if (wm.type === 'image' && wm.image && wm.image.width > 0) {
      const w = Math.round(outW * 0.18);
      const h = Math.round(w * (wm.image.height / wm.image.width));
      const at = anchorBox(wm.position, outW, outH, w, h, margin);
      ctx.drawImage(wm.image, at.x, at.y, w, h);
    } else if (wm.type === 'text' && wm.text) {
      const px = Math.max(12, Math.round(30 * scale));
      ctx.font = `600 ${px}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const w = ctx.measureText(wm.text).width;
      const at = anchorBox(wm.position, outW, outH, w, px, margin);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = Math.max(1, Math.round(3 * scale));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(wm.text, at.x, at.y);
    }
    ctx.restore();
  }

  const subs = spec.subtitles;
  const cue = subs ? activeCue(subs.cues, timeSec) : null;
  if (subs && cue) {
    ctx.save();
    const px = Math.max(10, Math.round(subs.size * scale));
    ctx.font = `600 ${px}px ${JSON.stringify(subs.font)}, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lines = cue.text.split(/\r?\n/).filter(Boolean);
    const lineH = Math.round(px * 1.25);
    const blockH = lineH * lines.length;
    const y0 = subs.position === 'Top' ? margin : subs.position === 'Center' ? (outH - blockH) / 2 : outH - margin - blockH;
    lines.forEach((line, i) => {
      const y = y0 + i * lineH;
      if (subs.style === 'Box') {
        const w = ctx.measureText(line).width + px * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(outW / 2 - w / 2, y - px * 0.1, w, lineH);
      }
      if (subs.style === 'Outline') {
        ctx.lineWidth = Math.max(2, Math.round(px / 8));
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000000';
        ctx.strokeText(line, outW / 2, y);
      }
      if (subs.style === 'Shadow') {
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = Math.max(2, Math.round(px / 6));
        ctx.shadowOffsetY = Math.max(1, Math.round(px / 14));
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, outW / 2, y);
    });
    ctx.restore();
  }
}

/** Load an image data/blob URL for an image watermark. */
export function loadWatermarkImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the watermark image.'));
    img.src = url;
  });
}
