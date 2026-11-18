// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Live preview of Gallery adjustments: the photo is decoded once, scaled to at
// most 1600 px on its long side (bounded memory), and the same pixel pipeline
// the export uses runs on it, coalesced to one pass per frame while a slider
// moves. Export (renderEditedBlob) runs that pipeline at full resolution.

import React, { useEffect, useRef } from 'react';
import { applyAdjustments, isNeutral, type Adjustments } from './galleryAdjust';
import { editedCanvasSize, type CropRatio } from './galleryEdit';

const PREVIEW_MAX = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be loaded.'));
    img.src = src;
  });
}

export const AdjustedPreview: React.FC<{ src: string; adj: Adjustments; style?: React.CSSProperties; label: string }> = ({ src, adj, style, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const frameRef = useRef(0);
  const adjRef = useRef(adj);
  adjRef.current = adj;

  const draw = () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const c = canvasRef.current;
      const base = baseRef.current;
      if (!c || !base) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const work = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      applyAdjustments(work.data, adjRef.current);
      ctx.putImageData(work, 0, 0);
    });
  };

  useEffect(() => {
    let alive = true;
    baseRef.current = null;
    loadImage(src).then((img) => {
      if (!alive || !canvasRef.current) return;
      const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = canvasRef.current;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      baseRef.current = ctx.getImageData(0, 0, w, h);
      draw();
    }).catch(() => { /* the <img> fallback shows the load error */ });
    return () => { alive = false; cancelAnimationFrame(frameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => { draw(); }, [adj]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvasRef} role="img" aria-label={label} data-testid="gallery-adjusted-preview" style={style} />;
};

export interface EditGeometry { rotation: number; straighten: number; flipH: boolean; flipV: boolean; ratio: CropRatio }

/** Full-resolution edited copy: geometry, then the adjustment pipeline. */
export async function renderEditedBlob(src: string, geo: EditGeometry, adj: Adjustments): Promise<Blob> {
  const img = await loadImage(src);
  const rot = ((geo.rotation % 360) + 360) % 360;
  const out = editedCanvasSize(img.naturalWidth, img.naturalHeight, rot, geo.straighten, geo.ratio);
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.translate(out.w / 2, out.h / 2);
  ctx.rotate(((rot + geo.straighten) * Math.PI) / 180);
  ctx.scale(geo.flipH ? -1 : 1, geo.flipV ? -1 : 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!isNeutral(adj)) {
    const data = ctx.getImageData(0, 0, out.w, out.h);
    applyAdjustments(data.data, adj);
    ctx.putImageData(data, 0, 0);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encoding failed.'))), 'image/png'));
}
