// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Cursor-anchored menu placement -- the ONE rule for keeping a context menu (or
// any point-anchored popover) fully on-screen.
//
// Across the shell and apps this was hand-rolled ~6 different ways, all variants
// of `Math.min(clientX, innerWidth - 200)`: magic sizes, no minimum edge margin
// (so a menu could hug or cross the viewport edge), and several clamped only one
// axis (overflowing the other). This is the single, tested replacement.
//
// `useDropdownPosition` already covers ANCHORED dropdowns (a menu that hangs off
// a trigger element at top:100%). This covers the other case: a menu that opens
// at an arbitrary point (a right-click). Pure (no DOM) so it is unit-testable;
// callers pass the live viewport and the menu's size.

export interface Point {
  x: number;
  y: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MenuPlacementOptions {
  /** Minimum gap kept between the menu and every viewport edge, in px. Default 8. */
  margin?: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
}

/** Clamp one axis: keep [coord, coord+size] within [margin, extent - margin]. */
function placeAxis(coord: number, size: number, extent: number, margin: number): number {
  const max = extent - margin - size;
  // Menu is larger than the available space -> pin to the near edge so at least
  // its origin (and any internal scroll) is reachable.
  if (max < margin) return margin;
  // Otherwise sit at the cursor, shifting back toward the start only as much as
  // needed to keep the far edge inside the margin.
  return Math.max(margin, Math.min(coord, max));
}

/**
 * Place a point-anchored menu so the whole menu stays inside the viewport.
 * Returns the `{ left, top }` to apply to a `position: fixed` menu.
 */
export function clampMenuToViewport(
  point: Point,
  menu: MenuSize,
  viewport: Viewport,
  options: MenuPlacementOptions = {},
): MenuPlacement {
  const margin = options.margin ?? 8;
  return {
    left: placeAxis(point.x, menu.width, viewport.width, margin),
    top: placeAxis(point.y, menu.height, viewport.height, margin),
  };
}

/** The current browser viewport, or a sane default off-DOM (tests / SSR). */
export function currentViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Ergonomic helper for context-menu `onContextMenu` handlers: clamp a mouse
 * event's point against the live viewport. `menu` defaults to a conservative
 * typical context-menu box so a caller that doesn't measure still gets a menu
 * that stays on-screen (strictly better than the raw `clientX/clientY` most
 * handlers stored). Returns `{ left, top }` to store and apply as fixed coords.
 */
export function clampEventToViewport(
  e: { clientX: number; clientY: number },
  menu: MenuSize = { width: 224, height: 320 },
  options?: MenuPlacementOptions,
): MenuPlacement {
  return clampMenuToViewport({ x: e.clientX, y: e.clientY }, menu, currentViewport(), options);
}
