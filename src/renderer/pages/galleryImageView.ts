// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface Point { x: number; y: number }
interface Size { width: number; height: number }
export interface GalleryImageView { zoom: number; pan: Point }

export function clampImagePan(view: GalleryImageView, viewport: Size, image: Size, rotation: number): GalleryImageView {
  if (view.zoom <= 1 || image.width <= 0 || image.height <= 0) return { ...view, pan: { x: 0, y: 0 } };
  const fit = Math.min(viewport.width / image.width, viewport.height / image.height);
  const sideways = rotation % 180 !== 0;
  const width = (sideways ? image.height : image.width) * fit * view.zoom;
  const height = (sideways ? image.width : image.height) * fit * view.zoom;
  const maxX = Math.max(0, (width - viewport.width) / 2);
  const maxY = Math.max(0, (height - viewport.height) / 2);
  return {
    ...view,
    pan: {
      x: maxX === 0 ? 0 : Math.max(-maxX, Math.min(maxX, view.pan.x)),
      y: maxY === 0 ? 0 : Math.max(-maxY, Math.min(maxY, view.pan.y)),
    },
  };
}

export function zoomImageAt(view: GalleryImageView, zoom: number, anchor: Point): GalleryImageView {
  const next = Math.max(1, Math.min(8, zoom));
  const ratio = next / view.zoom;
  return { zoom: next, pan: { x: anchor.x + (view.pan.x - anchor.x) * ratio, y: anchor.y + (view.pan.y - anchor.y) * ratio } };
}
