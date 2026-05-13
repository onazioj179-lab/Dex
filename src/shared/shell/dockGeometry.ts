// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pure dock geometry helpers. No DOM, no React, no Electron.
// Computes positioning, layout direction, and icon sizing for the DEX dock
// (the macOS/Windows-taskbar-equivalent). Drives the "movable taskbar" and
// "compact taskbar" features. Used by AppManager (renderer) and exercised by
// unit tests in tests/unit/dockGeometry.test.ts.

export type DockEdge = 'bottom' | 'top' | 'left' | 'right';
export type DockSizePreset = 'compact' | 'regular' | 'large' | 'floating';

/** Visible/hidden offset in pixels when the dock auto-hides off-screen. */
const HIDE_OFFSET_PX = 12;

/** Margin from the edge in regular mode. Compact tucks closer; floating lifts off. */
const EDGE_MARGIN_BY_PRESET: Record<DockSizePreset, number> = {
  compact: 4,
  regular: 10,
  large: 14,
  floating: 22,
};

/** Icon pixel size by preset. Compact halves visual footprint. */
const ICON_SIZE_BY_PRESET: Record<DockSizePreset, number> = {
  compact: 28,
  regular: 40,
  large: 56,
  floating: 36,
};

/** Inner padding of the dock pill by preset. */
const INNER_PADDING_BY_PRESET: Record<DockSizePreset, { x: number; y: number }> = {
  compact: { x: 6, y: 2 },
  regular: { x: 10, y: 4 },
  large: { x: 14, y: 6 },
  floating: { x: 12, y: 6 },
};

/** Border radius of the dock pill by preset. */
const BORDER_RADIUS_BY_PRESET: Record<DockSizePreset, number> = {
  compact: 12,
  regular: 18,
  large: 22,
  floating: 28,
};

/** Magnification scale by preset (compact = no magnify to save space). */
const MAGNIFICATION_BY_PRESET: Record<DockSizePreset, number> = {
  compact: 1.0,
  regular: 1.15,
  large: 1.25,
  floating: 1.20,
};

export interface DockGeometryInput {
  edge: DockEdge;
  preset: DockSizePreset;
  /** Whether the dock should currently be visible (auto-hide animation). */
  visible: boolean;
}

export interface DockGeometryStyle {
  /** CSS position rule object. */
  positionStyle: Record<string, string | number>;
  /** Flex direction for the inner pill. */
  flexDirection: 'row' | 'column';
  /** Pixel size of icons. */
  iconSize: number;
  /** Inner padding x/y. */
  paddingX: number;
  paddingY: number;
  /** Border radius. */
  borderRadius: number;
  /** Magnification scale to apply on hover. */
  magnificationScale: number;
  /** Hide-edge translation transform applied when `visible` is false. */
  hiddenTransform: string;
  /** Visible transform (the "settled" position). */
  visibleTransform: string;
}

/**
 * Compute the positioning + sizing style block for the dock based on its
 * configured edge and size preset. Pure, side-effect-free.
 */
export function computeDockGeometry(input: DockGeometryInput): DockGeometryStyle {
  const { edge, preset } = input;
  const margin = EDGE_MARGIN_BY_PRESET[preset];
  const iconSize = ICON_SIZE_BY_PRESET[preset];
  const inner = INNER_PADDING_BY_PRESET[preset];
  const borderRadius = BORDER_RADIUS_BY_PRESET[preset];
  const magnificationScale = MAGNIFICATION_BY_PRESET[preset];

  let positionStyle: Record<string, string | number>;
  let flexDirection: 'row' | 'column';
  let visibleTransform: string;
  let hiddenTransform: string;

  switch (edge) {
    case 'top':
      positionStyle = { position: 'fixed', top: margin, left: '50%' };
      flexDirection = 'row';
      visibleTransform = 'translateX(-50%) translateY(0)';
      hiddenTransform = `translateX(-50%) translateY(-${HIDE_OFFSET_PX}px)`;
      break;
    case 'left':
      positionStyle = { position: 'fixed', left: margin, top: '50%' };
      flexDirection = 'column';
      visibleTransform = 'translateY(-50%) translateX(0)';
      hiddenTransform = `translateY(-50%) translateX(-${HIDE_OFFSET_PX}px)`;
      break;
    case 'right':
      positionStyle = { position: 'fixed', right: margin, top: '50%' };
      flexDirection = 'column';
      visibleTransform = 'translateY(-50%) translateX(0)';
      hiddenTransform = `translateY(-50%) translateX(${HIDE_OFFSET_PX}px)`;
      break;
    case 'bottom':
    default:
      positionStyle = { position: 'fixed', bottom: margin, left: '50%' };
      flexDirection = 'row';
      visibleTransform = 'translateX(-50%) translateY(0)';
      hiddenTransform = `translateX(-50%) translateY(${HIDE_OFFSET_PX}px)`;
      break;
  }

  return {
    positionStyle,
    flexDirection,
    iconSize,
    paddingX: inner.x,
    paddingY: inner.y,
    borderRadius,
    magnificationScale,
    hiddenTransform,
    visibleTransform,
  };
}

/**
 * Validate / normalize a stored edge value. Falls back to 'bottom' for any
 * unknown value so corrupt prefs cannot break shell rendering.
 */
export function normalizeDockEdge(value: unknown): DockEdge {
  if (value === 'top' || value === 'bottom' || value === 'left' || value === 'right') {
    return value;
  }
  return 'bottom';
}

/** Validate / normalize a stored preset value. Falls back to 'regular'. */
export function normalizeDockPreset(value: unknown): DockSizePreset {
  if (
    value === 'compact' ||
    value === 'regular' ||
    value === 'large' ||
    value === 'floating'
  ) {
    return value;
  }
  return 'regular';
}

/** True when the preset visually "lifts" the dock off the edge. */
export function isFloatingPreset(preset: DockSizePreset): boolean {
  return preset === 'floating';
}

export interface ReservedInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Pixel insets the dock visually occupies on each viewport edge. Used by
 * the window manager to size maximized/snapped windows so that app surfaces
 * never sit underneath the dock. Magnification is included with a small
 * safety margin so the dock pill never clips the active window even when an
 * icon is hovered.
 *
 * When `visible` is false the dock is hidden off-edge and reserves nothing.
 */
export function getDockReservedInsets(
  edge: DockEdge,
  preset: DockSizePreset,
  visible: boolean,
): ReservedInsets {
  const empty: ReservedInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!visible) return empty;
  const margin = EDGE_MARGIN_BY_PRESET[preset];
  const iconSize = ICON_SIZE_BY_PRESET[preset];
  const inner = INNER_PADDING_BY_PRESET[preset];
  const magnification = MAGNIFICATION_BY_PRESET[preset];
  // Pill thickness perpendicular to the dock edge, with magnification headroom.
  const pillThickness = Math.ceil(iconSize * magnification + inner.y * 2);
  // Total inset = margin from edge + pill thickness + a small breathing pad.
  const breathingPad = 8;
  const reserved = margin + pillThickness + breathingPad;
  switch (edge) {
    case 'top':    return { ...empty, top: reserved };
    case 'bottom': return { ...empty, bottom: reserved };
    case 'left':   return { ...empty, left: reserved };
    case 'right':  return { ...empty, right: reserved };
    default:       return empty;
  }
}

/**
 * Returns the cardinal screen-edge a (clientX, clientY) cursor is closest to,
 * for "drag dock to a new edge" UX. Distance is computed against viewport
 * dimensions provided by the caller (testable).
 */
export function nearestEdge(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number
): DockEdge {
  const dTop = y;
  const dBottom = viewportHeight - y;
  const dLeft = x;
  const dRight = viewportWidth - x;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return 'top';
  if (min === dBottom) return 'bottom';
  if (min === dLeft) return 'left';
  return 'right';
}
