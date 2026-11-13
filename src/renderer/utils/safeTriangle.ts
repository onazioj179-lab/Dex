// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Safe triangle ("menu aim") geometry for hover submenus.
//
// When the pointer leaves a submenu row and heads diagonally for the flyout it
// crosses sibling rows. Without a guard those siblings steal the hover and the
// flyout closes before the pointer arrives. The guard: while the pointer stays
// inside the triangle formed by where it left the row (the apex) and the
// flyout's near edge, sibling hovers are deferred.

export interface Pt {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How long a deferred hover waits before it wins anyway (pointer stopped). */
export const AIM_GRACE_MS = 300;

/** Extra vertical room above/below the flyout edge, in px. */
const EDGE_PAD = 6;

function cross(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Point-in-triangle by sign of cross products; points on an edge count as inside. */
export function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Is a pointer at `p` still on its way from `origin` to the flyout `rect`?
 * Works for flyouts on either side (submenus flip left near the screen edge).
 */
export function isAimingAtRect(origin: Pt, p: Pt, rect: RectLike): boolean {
  const toRight = rect.left >= origin.x - 1;
  const edgeX = toRight ? rect.left : rect.right;
  // Already past the near edge horizontally: only "aiming" if within its span.
  if (toRight ? p.x >= edgeX : p.x <= edgeX) {
    return p.y >= rect.top - EDGE_PAD && p.y <= rect.bottom + EDGE_PAD;
  }
  return pointInTriangle(
    p,
    origin,
    { x: edgeX, y: rect.top - EDGE_PAD },
    { x: edgeX, y: rect.bottom + EDGE_PAD },
  );
}
