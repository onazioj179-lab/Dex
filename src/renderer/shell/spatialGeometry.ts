// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import type { ViewportSize, WindowBounds } from '../../shared/shell/windowLayout';

export interface SpatialCamera {
  scale: number;
  x: number;
  y: number;
}

export const DEFAULT_SPATIAL_CAMERA: SpatialCamera = { scale: 0.85, x: 0, y: 0 };
export const MIN_SPATIAL_SCALE = 0.65;
export const MAX_SPATIAL_SCALE = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampCamera(camera: SpatialCamera, viewport: ViewportSize): SpatialCamera {
  const scale = clamp(camera.scale, MIN_SPATIAL_SCALE, MAX_SPATIAL_SCALE);
  // Leave a reachable strip of the workspace at each edge during panning.
  const visibleX = Math.min(120, viewport.width * 0.4);
  const visibleY = Math.min(96, viewport.height * 0.4);
  return {
    scale,
    x: clamp(camera.x, visibleX - viewport.width * scale, viewport.width - visibleX),
    y: clamp(camera.y, visibleY - viewport.height * scale, viewport.height - visibleY),
  };
}

export function zoomAt(camera: SpatialCamera, scale: number, anchor: { x: number; y: number }, viewport: ViewportSize): SpatialCamera {
  const ratio = clamp(scale, MIN_SPATIAL_SCALE, MAX_SPATIAL_SCALE) / camera.scale;
  return clampCamera({
    scale: camera.scale * ratio,
    x: anchor.x + (camera.x - anchor.x) * ratio,
    y: anchor.y + (camera.y - anchor.y) * ratio,
  }, viewport);
}

export function fitSpatialWindows(windows: readonly WindowBounds[], viewport: ViewportSize): SpatialCamera | null {
  if (!windows.length || viewport.width <= 0 || viewport.height <= 0) return null;
  const left = Math.min(...windows.map(bounds => bounds.x));
  const top = Math.min(...windows.map(bounds => bounds.y));
  const width = Math.max(...windows.map(bounds => bounds.x + bounds.w)) - left;
  const height = Math.max(...windows.map(bounds => bounds.y + bounds.h)) - top;
  if (width <= 0 || height <= 0) return null;
  const horizontalPadding = Math.min(24, viewport.width / 8);
  const topPadding = Math.min(20, viewport.height / 10);
  const bottomPadding = Math.min(92, viewport.height / 4);
  const usableHeight = viewport.height - topPadding - bottomPadding;
  const scale = Math.max(MIN_SPATIAL_SCALE, Math.min(1, (viewport.width - 2 * horizontalPadding) / width, usableHeight / height));
  return clampCamera({
    scale,
    x: (viewport.width - width * scale) / 2 - left * scale,
    y: topPadding + (usableHeight - height * scale) / 2 - top * scale,
  }, viewport);
}

export type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function resizeWindow(bounds: WindowBounds, workspace: WindowBounds, edge: ResizeEdge, dx: number, dy: number): WindowBounds {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  const minWidth = Math.min(360, bounds.w);
  const minHeight = Math.min(280, bounds.h);
  const left = edge.includes('w') ? clamp(bounds.x + dx, workspace.x, right - minWidth) : bounds.x;
  const top = edge.includes('n') ? clamp(bounds.y + dy, workspace.y, bottom - minHeight) : bounds.y;
  const nextRight = edge.includes('e') ? clamp(right + dx, left + minWidth, workspace.x + workspace.w) : right;
  const nextBottom = edge.includes('s') ? clamp(bottom + dy, top + minHeight, workspace.y + workspace.h) : bottom;
  return { x: Math.round(left), y: Math.round(top), w: Math.round(nextRight - left), h: Math.round(nextBottom - top) };
}
