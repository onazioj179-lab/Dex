// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Pure geometry + clamp for the FloatingLauncher orb cluster. Extracted from the
// component so the bounds logic (the source of the historical left/right "jump")
// is unit-testable without React.

import { clamp } from '../../shared/math/num';

// One shared size for all three members of the cluster (Launcher / UKI / Search)
// so they read as a single, consistent group.
export const SIZE = 46;
export const GAP = 7;
export const EDGE_PAD = 18;

/**
 * The single source of truth for where the orb anchor may sit, used by EVERY
 * path (resolve, default corner, drag). The launcher lives INSIDE the DEX window,
 * so the window viewport is the correct bound (it can never leave the window --
 * no per-monitor IPC needed). Padding all four edges identically is what removes
 * the old jump: previously resolve(), the default corner, and the drag clamp used
 * three different bounds, so a drag-release re-resolve shifted the orb by EDGE_PAD.
 */
export function clampToBounds(px: number, py: number, vw: number, vh: number): { x: number; y: number } {
  const maxX = Math.max(EDGE_PAD, vw - SIZE - EDGE_PAD);
  const maxY = Math.max(EDGE_PAD, vh - SIZE - EDGE_PAD);
  return { x: clamp(px, EDGE_PAD, maxX), y: clamp(py, EDGE_PAD, maxY) };
}

/**
 * Clamp the cluster ANCHOR (the launcher, which sits at the BOTTOM of the stack;
 * UKI + Search rise above it) so the WHOLE cluster stays on-screen.
 *
 * The old code clamped the anchor as if it were a single orb, then flipped the
 * stack direction (up vs down) depending on whether `pos.y` had room above. That
 * flip happened MID-DRAG when the anchor crossed a threshold, snapping the orbs to
 * the other side of the anchor -- the "orbs glitch / scatter / can't move all 3"
 * bug. Clamping for the full cluster height lets us keep ONE stable stack
 * direction (always up), so the three orbs move as one rigid unit and never jump.
 */
export function clampClusterToBounds(
  px: number, py: number, vw: number, vh: number, count: number,
): { x: number; y: number } {
  const maxX = Math.max(EDGE_PAD, vw - SIZE - EDGE_PAD);
  // The stack rises from the anchor by (count-1) slots; reserve that above.
  const extentAbove = Math.max(0, count - 1) * (SIZE + GAP);
  const minY = EDGE_PAD + extentAbove;
  const maxY = vh - SIZE - EDGE_PAD;
  // Degenerate viewport too short for the whole cluster: keep the anchor visible.
  if (maxY < minY) {
    return { x: clamp(px, EDGE_PAD, maxX), y: clamp(py, EDGE_PAD, Math.max(EDGE_PAD, maxY)) };
  }
  return { x: clamp(px, EDGE_PAD, maxX), y: clamp(py, minY, maxY) };
}

// ---------------------------------------------------------------------------
// DEX Bar geometry (v6 redesign)
// ---------------------------------------------------------------------------
// The launcher is no longer a vertical stack of round orbs but a single, sharp,
// horizontal command bar. It is one rigid rectangle (top-left x/y persisted),
// so the clamp is a plain rectangle clamp -- same symmetric EDGE_PAD on every
// path as clampToBounds, so a drag-release re-resolve can never shift it.

/** Height of the DEX Bar in px (matches the `lg` control height in the token scale). */
export const BAR_HEIGHT = 40;

/**
 * Clamp the bar's TOP-LEFT corner so the whole bar (barW x barH) stays inside
 * the window, padded by EDGE_PAD on all four edges. Width is passed in because
 * the bar's content width varies with how many segments are present (Search is
 * optional). Mirrors clampToBounds: one bound for every path, idempotent.
 */
export function clampBarToBounds(
  px: number, py: number, vw: number, vh: number, barW: number, barH: number = BAR_HEIGHT,
): { x: number; y: number } {
  const maxX = Math.max(EDGE_PAD, vw - barW - EDGE_PAD);
  const maxY = Math.max(EDGE_PAD, vh - barH - EDGE_PAD);
  return { x: clamp(px, EDGE_PAD, maxX), y: clamp(py, EDGE_PAD, maxY) };
}
