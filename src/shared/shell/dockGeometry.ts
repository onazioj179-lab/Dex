// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Dock preference types + validators. No DOM, no React, no Electron.
//
// The dock itself was removed in favour of the FloatingLauncher, so the live
// geometry/positioning helpers are gone. What remains are the persisted-pref
// types and their normalizers, which `shellPreferencesStore` still uses to keep
// stored shell preferences well-formed (and so the dock layout could be revived
// from prefs without a schema migration). Exercised by tests/unit/dockGeometry.test.ts.

export type DockEdge = 'bottom' | 'top' | 'left' | 'right';
export type DockSizePreset = 'compact' | 'regular' | 'large' | 'floating';
/**
 * Alignment ALONG the dock's edge. For a horizontal edge (bottom/top):
 * start = left, center = centre, end = right. For a vertical edge (left/right):
 * start = top, center = centre, end = bottom.
 */
export type DockAlign = 'start' | 'center' | 'end';

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

/** Validate / normalize a stored alignment value. Falls back to 'center'. */
export function normalizeDockAlign(value: unknown): DockAlign {
  if (value === 'start' || value === 'center' || value === 'end') return value;
  return 'center';
}
