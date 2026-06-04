// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Zoom level math (Prism/Vinx/Canvas/AXL viewers). Standard zoom stops with
 * next/prev stepping, clamping, and a fit-to-viewport computation. Pure: no DOM.
 */

/** Standard zoom stops (1 = 100%). */
export const ZOOM_STOPS: readonly number[] =
  [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 32];

export const MIN_ZOOM = ZOOM_STOPS[0];
export const MAX_ZOOM = ZOOM_STOPS[ZOOM_STOPS.length - 1];

/** Clamp a zoom factor into the supported range. */
export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** The next stop strictly greater than `current` (or MAX). */
export function nextZoom(current: number): number {
  for (const stop of ZOOM_STOPS) if (stop > current + 1e-9) return stop;
  return MAX_ZOOM;
}

/** The previous stop strictly less than `current` (or MIN). */
export function prevZoom(current: number): number {
  for (let i = ZOOM_STOPS.length - 1; i >= 0; i--) {
    if (ZOOM_STOPS[i] < current - 1e-9) return ZOOM_STOPS[i];
  }
  return MIN_ZOOM;
}

/** Zoom that fits `content` fully inside `viewport` (contain), clamped. */
export function fitZoom(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
): number {
  if (content.width <= 0 || content.height <= 0) return 1;
  const z = Math.min(viewport.width / content.width, viewport.height / content.height);
  return clampZoom(z);
}

/** Format a zoom factor as a percentage string ("150%"). */
export function zoomPercent(z: number): string {
  return `${Math.round(z * 100)}%`;
}
