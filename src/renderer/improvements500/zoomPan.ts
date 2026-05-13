// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pan + zoom transform math for canvas/graph viewports (T5 UKI graph,
 * T3 creative-app canvases, T11 pinch-zoom call sites).
 *
 * Coordinate convention: world coords map through the transform to screen
 * coords as: `screen = world * scale + translate`.
 */

export interface Transform { x: number; y: number; scale: number; }

export const IDENTITY: Transform = Object.freeze({ x: 0, y: 0, scale: 1 });

export function worldToScreen(t: Transform, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * t.scale + t.x, y: wy * t.scale + t.y };
}

export function screenToWorld(t: Transform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - t.x) / t.scale, y: (sy - t.y) / t.scale };
}

/** Zoom around a screen-space anchor point so that point stays put. */
export function zoomAt(t: Transform, anchorX: number, anchorY: number, factor: number, opts?: { min?: number; max?: number }): Transform {
  const min = opts?.min ?? 0.1;
  const max = opts?.max ?? 16;
  const next = Math.max(min, Math.min(max, t.scale * factor));
  const realFactor = next / t.scale;
  return {
    x: anchorX - (anchorX - t.x) * realFactor,
    y: anchorY - (anchorY - t.y) * realFactor,
    scale: next,
  };
}

export function panBy(t: Transform, dx: number, dy: number): Transform {
  return { ...t, x: t.x + dx, y: t.y + dy };
}

/** Compute the transform that fits a world-rect into a viewport rect. */
export function fitToView(world: { x: number; y: number; width: number; height: number },
                          view: { width: number; height: number },
                          padding = 32): Transform {
  if (world.width <= 0 || world.height <= 0) return IDENTITY;
  const sx = (view.width - padding * 2) / world.width;
  const sy = (view.height - padding * 2) / world.height;
  const scale = Math.min(sx, sy);
  return {
    x: -world.x * scale + (view.width - world.width * scale) / 2,
    y: -world.y * scale + (view.height - world.height * scale) / 2,
    scale,
  };
}
