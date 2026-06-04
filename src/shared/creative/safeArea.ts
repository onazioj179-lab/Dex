// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Broadcast safe areas (Vinx/Flux viewer overlays). Computes the title-safe and
 * action-safe rectangles for a frame — the classic 90%/80% insets used to keep
 * text and key action inside the visible region. Pure: no DOM, no IO.
 */

export interface Rect { x: number; y: number; width: number; height: number }

/** Centered inset rectangle keeping `fraction` (0..1) of the frame. */
export function insetRect(width: number, height: number, fraction: number): Rect {
  const f = Math.min(1, Math.max(0, fraction));
  const w = width * f;
  const h = height * f;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export interface SafeAreas {
  action: Rect; // 90%
  title: Rect;  // 80%
}

/** Action-safe (90%) and title-safe (80%) rects for a frame. */
export function safeAreas(width: number, height: number): SafeAreas {
  return {
    action: insetRect(width, height, 0.9),
    title: insetRect(width, height, 0.8),
  };
}

/** True when a point lies inside a rect (inclusive). */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
