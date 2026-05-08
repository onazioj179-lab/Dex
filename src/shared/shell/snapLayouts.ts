// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// snapLayouts
//
// Magnet / Rectangle-style frame snapping for DEX. Pure: takes a screen rect,
// the current frame rect, and either an explicit zone or a cursor drop point,
// and returns the target frame rect. No DOM, no Electron — driven by tests.
//
// The DEX shell renders apps inside in-shell frames (not OS-level surfaces),
// so this helper computes the target geometry relative to the workspace area
// (the screen minus the dock).
// =============================================================================

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SnapZone =
  | 'left-half'
  | 'right-half'
  | 'top-half'
  | 'bottom-half'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left-third'
  | 'center-third'
  | 'right-third'
  | 'left-two-thirds'
  | 'right-two-thirds'
  | 'maximize'
  | 'center'
  | 'restore';

export interface SnapInput {
  /** The full workspace rect available to the shell (screen minus dock). */
  workspace: Rect;
  /** Margin in pixels around each snapped frame (gutter). */
  gutter?: number;
}

/** Compute the target frame for an explicit zone selection. */
export function snapTo(zone: SnapZone, input: SnapInput, currentFrame?: Rect): Rect {
  const w = input.workspace;
  const g = input.gutter ?? 0;
  const halfW = (w.width - 3 * g) / 2;
  const halfH = (w.height - 3 * g) / 2;
  const thirdW = (w.width - 4 * g) / 3;

  const leftX = w.x + g;
  const rightX = w.x + g + halfW + g;
  const topY = w.y + g;
  const bottomY = w.y + g + halfH + g;

  switch (zone) {
    case 'left-half':
      return clamp({ x: leftX, y: topY, width: halfW, height: w.height - 2 * g }, w);
    case 'right-half':
      return clamp({ x: rightX, y: topY, width: halfW, height: w.height - 2 * g }, w);
    case 'top-half':
      return clamp({ x: leftX, y: topY, width: w.width - 2 * g, height: halfH }, w);
    case 'bottom-half':
      return clamp({ x: leftX, y: bottomY, width: w.width - 2 * g, height: halfH }, w);
    case 'top-left':
      return clamp({ x: leftX, y: topY, width: halfW, height: halfH }, w);
    case 'top-right':
      return clamp({ x: rightX, y: topY, width: halfW, height: halfH }, w);
    case 'bottom-left':
      return clamp({ x: leftX, y: bottomY, width: halfW, height: halfH }, w);
    case 'bottom-right':
      return clamp({ x: rightX, y: bottomY, width: halfW, height: halfH }, w);
    case 'left-third':
      return clamp({ x: leftX, y: topY, width: thirdW, height: w.height - 2 * g }, w);
    case 'center-third':
      return clamp({ x: leftX + thirdW + g, y: topY, width: thirdW, height: w.height - 2 * g }, w);
    case 'right-third':
      return clamp({ x: leftX + 2 * (thirdW + g), y: topY, width: thirdW, height: w.height - 2 * g }, w);
    case 'left-two-thirds':
      return clamp({ x: leftX, y: topY, width: 2 * thirdW + g, height: w.height - 2 * g }, w);
    case 'right-two-thirds':
      return clamp({ x: leftX + thirdW + g, y: topY, width: 2 * thirdW + g, height: w.height - 2 * g }, w);
    case 'maximize':
      return clamp({ x: leftX, y: topY, width: w.width - 2 * g, height: w.height - 2 * g }, w);
    case 'center': {
      const cw = currentFrame?.width ?? Math.round(w.width * 0.6);
      const ch = currentFrame?.height ?? Math.round(w.height * 0.6);
      return clamp(
        {
          x: w.x + Math.round((w.width - cw) / 2),
          y: w.y + Math.round((w.height - ch) / 2),
          width: cw,
          height: ch,
        },
        w
      );
    }
    case 'restore': {
      if (!currentFrame) {
        return snapTo('center', input, undefined);
      }
      return currentFrame;
    }
  }
}

/**
 * Map a cursor drop point inside the workspace to the most likely snap zone,
 * matching Magnet's edge-trigger behavior. Returns null when the point is
 * away from any edge / corner.
 *
 * Trigger thresholds:
 *   - Within `cornerPct` of any corner -> quadrant.
 *   - Within `edgePct` of an edge -> half.
 *   - Top edge near center horizontally -> maximize.
 */
export function zoneFromDropPoint(
  point: { x: number; y: number },
  workspace: Rect,
  thresholds: { edgePct?: number; cornerPct?: number; topMaximizePct?: number } = {}
): SnapZone | null {
  const edgePct = thresholds.edgePct ?? 0.04;
  const cornerPct = thresholds.cornerPct ?? 0.08;
  const topMaximizePct = thresholds.topMaximizePct ?? 0.2;

  const w = workspace;
  if (
    point.x < w.x ||
    point.x > w.x + w.width ||
    point.y < w.y ||
    point.y > w.y + w.height
  ) {
    return null;
  }

  const relX = (point.x - w.x) / w.width;
  const relY = (point.y - w.y) / w.height;

  const nearLeft = relX <= cornerPct;
  const nearRight = relX >= 1 - cornerPct;
  const nearTop = relY <= cornerPct;
  const nearBottom = relY >= 1 - cornerPct;

  if (nearTop && nearLeft) return 'top-left';
  if (nearTop && nearRight) return 'top-right';
  if (nearBottom && nearLeft) return 'bottom-left';
  if (nearBottom && nearRight) return 'bottom-right';

  // Top-edge center -> maximize (Magnet behavior).
  if (relY <= edgePct && relX > topMaximizePct && relX < 1 - topMaximizePct) {
    return 'maximize';
  }
  if (relX <= edgePct) return 'left-half';
  if (relX >= 1 - edgePct) return 'right-half';
  if (relY <= edgePct) return 'top-half';
  if (relY >= 1 - edgePct) return 'bottom-half';

  return null;
}

/** Clamp a frame to lie within the workspace. */
function clamp(frame: Rect, workspace: Rect): Rect {
  const x = Math.max(workspace.x, Math.min(frame.x, workspace.x + workspace.width - 1));
  const y = Math.max(workspace.y, Math.min(frame.y, workspace.y + workspace.height - 1));
  const maxW = workspace.x + workspace.width - x;
  const maxH = workspace.y + workspace.height - y;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(1, Math.min(frame.width, maxW))),
    height: Math.round(Math.max(1, Math.min(frame.height, maxH))),
  };
}

/**
 * Cycle through related zones when the same shortcut is pressed repeatedly
 * (Rectangle's "press left twice for left-third" behavior). Returns the next
 * zone in the cycle for the given starting zone.
 */
export function nextInCycle(zone: SnapZone): SnapZone {
  switch (zone) {
    case 'left-half': return 'left-third';
    case 'left-third': return 'left-two-thirds';
    case 'left-two-thirds': return 'left-half';
    case 'right-half': return 'right-third';
    case 'right-third': return 'right-two-thirds';
    case 'right-two-thirds': return 'right-half';
    default: return zone;
  }
}
