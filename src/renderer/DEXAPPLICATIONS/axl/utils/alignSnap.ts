// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Alignment-snap inference for part moves (pure, unit-tested).
 *
 * While dragging a part, each axis is pulled onto another part's center when
 * within tolerance — so parts line up like real CAD (SolidWorks inference /
 * Figma smart guides) instead of only landing on grid multiples. Axes that
 * don't snap fall back to grid quantization. `free` (Alt held) bypasses both.
 */

export interface Vec3Like { x: number; y: number; z: number }

export type SnapAxis = 'x' | 'y' | 'z';

export interface SnapCandidate {
  id: string;
  position: Vec3Like;
}

export interface SnapGuide {
  axis: SnapAxis;
  /** Final center of the moved part */
  a: Vec3Like;
  /** Center of the part it aligned to */
  b: Vec3Like;
}

export interface AlignSnapResult {
  position: Vec3Like;
  guides: SnapGuide[];
}

const AXES: readonly SnapAxis[] = ['x', 'y', 'z'];

export function alignSnapPosition(
  tentative: Vec3Like,
  others: SnapCandidate[],
  opts: { tolerance: number; gridSnap: number; snapEnabled: boolean; free: boolean },
): AlignSnapResult {
  const t = { ...tentative };
  const snapTo: Partial<Record<SnapAxis, Vec3Like>> = {};

  if (opts.snapEnabled && !opts.free) {
    for (const other of others) {
      for (const axis of AXES) {
        if (!snapTo[axis] && Math.abs(t[axis] - other.position[axis]) < opts.tolerance) {
          t[axis] = other.position[axis];
          snapTo[axis] = other.position;
        }
      }
    }
  }

  // Unsnapped axes keep grid quantization; free placement skips it entirely.
  const grid = Math.max(1e-9, opts.gridSnap);
  const q = (axis: SnapAxis) =>
    snapTo[axis] || opts.free ? t[axis] : Math.round(t[axis] / grid) * grid;
  const position = { x: q('x'), y: q('y'), z: q('z') };

  const guides = (Object.keys(snapTo) as SnapAxis[]).map(axis => ({
    axis,
    a: position,
    b: snapTo[axis]!,
  }));

  return { position, guides };
}
