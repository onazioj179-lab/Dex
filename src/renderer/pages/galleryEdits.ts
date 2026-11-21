// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export const CROP_RATIOS = ['free', '16:9', '4:3', '1:1', '3:2'] as const;
type CropRatio = typeof CROP_RATIOS[number];

export interface GalleryEdits {
  e: number;
  c: number;
  s: number;
  t: number;
  rotation: number;
  straighten: number;
  crop: CropRatio;
  flipX: boolean;
  flipY: boolean;
}

export const DEFAULT_GALLERY_EDITS: GalleryEdits = {
  e: 0, c: 0, s: 0, t: 0, rotation: 0, straighten: 0, crop: 'free', flipX: false, flipY: false,
};

export function loadGalleryEdits(key: string): GalleryEdits {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as Partial<GalleryEdits> | null;
    if (!saved) return DEFAULT_GALLERY_EDITS;
    const bounded = (value: unknown, limit: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
    return {
      e: bounded(saved.e, 100), c: bounded(saved.c, 100), s: bounded(saved.s, 100), t: bounded(saved.t, 100),
      rotation: typeof saved.rotation === 'number' && [0, 90, 180, 270].includes(saved.rotation) ? saved.rotation : 0,
      straighten: bounded(saved.straighten, 45),
      crop: saved.crop && CROP_RATIOS.includes(saved.crop) ? saved.crop : 'free',
      flipX: saved.flipX === true,
      flipY: saved.flipY === true,
    };
  } catch {
    return DEFAULT_GALLERY_EDITS;
  }
}

export function galleryFilter({ e, c, s, t }: GalleryEdits): string {
  const parts: string[] = [];
  if (e) parts.push(`brightness(${1 + e / 100})`);
  if (c) parts.push(`contrast(${1 + c / 100})`);
  if (s) parts.push(`saturate(${1 + s / 100})`);
  if (t) parts.push(t > 0 ? `sepia(${t / 200})` : `hue-rotate(${t / 4}deg)`);
  return parts.join(' ') || 'none';
}

export function galleryEditFrame(width: number, height: number, edits: GalleryEdits) {
  const degrees = edits.rotation + edits.straighten;
  const radians = degrees * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  let frameWidth = width * cos + height * sin;
  let frameHeight = width * sin + height * cos;
  if (edits.crop !== 'free') {
    const [x, y] = edits.crop.split(':').map(Number);
    frameWidth = Math.min(frameWidth, frameHeight * x / y);
    frameHeight = Math.min(frameHeight, frameWidth * y / x);
  }
  return {
    width: Math.max(1, Math.round(frameWidth)),
    height: Math.max(1, Math.round(frameHeight)),
    degrees,
    radians,
    flipX: edits.flipX ? -1 : 1,
    flipY: edits.flipY ? -1 : 1,
  };
}

export async function encodeGalleryImage(src: string, edits: GalleryEdits): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const frame = galleryEditFrame(width, height, edits);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The image editor could not start.');
  context.translate(frame.width / 2, frame.height / 2);
  context.rotate(frame.radians);
  context.scale(frame.flipX, frame.flipY);
  context.filter = galleryFilter(edits);
  context.drawImage(image, -width / 2, -height / 2);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Could not encode the edited image as PNG.'));
  }, 'image/png'));
}
