// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Snap Engine
 * -----------------------------------------------------------------------------
 * Pure geometry helpers for window snapping. Extracted so FloatingWindow,
 * StageManager, and a future tiling overlay can all share the same logic and
 * stay visually consistent.
 *
 * Adds: 8-region snap (halves, quarters, thirds), edge magnetism between
 * windows, and "stash" edge detection for minimize-by-throw. Honors a SafeArea
 * (menu bar / dock insets).
 */

export type SnapZone =
  | 'left' | 'right' | 'full'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'left-third' | 'center-third' | 'right-third'
  | 'stash-left' | 'stash-right' | 'stash-bottom';

export interface SafeArea {
  /** Inset from each edge of the viewport. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapEnvironment {
  viewportWidth: number;
  viewportHeight: number;
  safeArea: SafeArea;
}

const DEFAULT_SAFE: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

const EDGE_PX = 20;
const CORNER_PX = 56;
const TOP_FULL_PX = 12;
const STASH_DEPTH_PX = 6; // how close to edge to trigger stash
const MIN_DRAG_FOR_STASH_PX = 220;

export function makeEnv(viewportWidth: number, viewportHeight: number, safe?: Partial<SafeArea>): SnapEnvironment {
  return {
    viewportWidth,
    viewportHeight,
    safeArea: { ...DEFAULT_SAFE, ...safe },
  };
}

function safeBox(env: SnapEnvironment): Rect {
  const { safeArea: s } = env;
  return {
    x: s.left,
    y: s.top,
    width: Math.max(320, env.viewportWidth - s.left - s.right),
    height: Math.max(240, env.viewportHeight - s.top - s.bottom),
  };
}

/** Detect snap zone from a pointer position (typically the drag cursor). */
export function detectZone(pointerX: number, pointerY: number, env: SnapEnvironment, opts?: { thirds?: boolean; stashVelocity?: number }): SnapZone | null {
  const box = safeBox(env);
  const inX = pointerX - box.x;
  const inY = pointerY - box.y;

  // Stash (throw towards an edge with high velocity).
  if (opts?.stashVelocity && opts.stashVelocity > 1.6) {
    if (inX <= STASH_DEPTH_PX) return 'stash-left';
    if (inX >= box.width - STASH_DEPTH_PX) return 'stash-right';
    if (inY >= box.height - STASH_DEPTH_PX) return 'stash-bottom';
  }

  const nearLeft = inX < EDGE_PX;
  const nearRight = inX > box.width - EDGE_PX;
  const nearTopFull = inY < TOP_FULL_PX;
  const nearTopCorner = inY < CORNER_PX;
  const nearBottomCorner = inY > box.height - CORNER_PX;

  if (nearTopFull && !nearLeft && !nearRight) return 'full';
  if (nearLeft && nearTopCorner) return 'top-left';
  if (nearRight && nearTopCorner) return 'top-right';
  if (nearLeft && nearBottomCorner) return 'bottom-left';
  if (nearRight && nearBottomCorner) return 'bottom-right';
  if (nearLeft) return 'left';
  if (nearRight) return 'right';

  if (opts?.thirds) {
    // Bottom-edge thirds gesture: hover near bottom mid third.
    if (inY > box.height - EDGE_PX) {
      const t = inX / box.width;
      if (t < 1 / 3) return 'left-third';
      if (t < 2 / 3) return 'center-third';
      return 'right-third';
    }
  }

  return null;
}

/** Resolve a snap zone to a concrete rect within the safe area. */
export function rectForZone(zone: SnapZone, env: SnapEnvironment): Rect {
  const box = safeBox(env);
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const thirdW = box.width / 3;

  switch (zone) {
    case 'full':         return { ...box };
    case 'left':         return { x: box.x, y: box.y, width: halfW, height: box.height };
    case 'right':        return { x: box.x + halfW, y: box.y, width: halfW, height: box.height };
    case 'top-left':     return { x: box.x, y: box.y, width: halfW, height: halfH };
    case 'top-right':    return { x: box.x + halfW, y: box.y, width: halfW, height: halfH };
    case 'bottom-left':  return { x: box.x, y: box.y + halfH, width: halfW, height: halfH };
    case 'bottom-right': return { x: box.x + halfW, y: box.y + halfH, width: halfW, height: halfH };
    case 'left-third':   return { x: box.x, y: box.y, width: thirdW, height: box.height };
    case 'center-third': return { x: box.x + thirdW, y: box.y, width: thirdW, height: box.height };
    case 'right-third':  return { x: box.x + 2 * thirdW, y: box.y, width: thirdW, height: box.height };
    // Stashes return small "off-screen" rects -- caller usually handles via minimize.
    case 'stash-left':   return { x: box.x - 8, y: box.y + halfH - 30, width: 8, height: 60 };
    case 'stash-right':  return { x: box.x + box.width, y: box.y + halfH - 30, width: 8, height: 60 };
    case 'stash-bottom': return { x: box.x + box.width / 2 - 30, y: box.y + box.height, width: 60, height: 8 };
  }
}

/** Edge magnetism: snap a candidate rect to neighbour edges within `tolerance`. */
export function magnetize(candidate: Rect, neighbours: Rect[], tolerance = 6): Rect {
  let { x, y, width, height } = candidate;
  for (const n of neighbours) {
    // Horizontal edges
    if (Math.abs(x - (n.x + n.width)) < tolerance) x = n.x + n.width;
    else if (Math.abs(x + width - n.x) < tolerance) x = n.x - width;
    else if (Math.abs(x - n.x) < tolerance) x = n.x;
    else if (Math.abs(x + width - (n.x + n.width)) < tolerance) x = n.x + n.width - width;
    // Vertical edges
    if (Math.abs(y - (n.y + n.height)) < tolerance) y = n.y + n.height;
    else if (Math.abs(y + height - n.y) < tolerance) y = n.y - height;
    else if (Math.abs(y - n.y) < tolerance) y = n.y;
    else if (Math.abs(y + height - (n.y + n.height)) < tolerance) y = n.y + n.height - height;
  }
  return { x, y, width, height };
}

/** Was this drag long enough to count as a "throw"? Helper for stash UX. */
export function isThrow(distancePx: number): boolean {
  return distancePx >= MIN_DRAG_FOR_STASH_PX;
}

export const _internal = { EDGE_PX, CORNER_PX, TOP_FULL_PX };
