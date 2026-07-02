// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Alignment-snap inference for part moves (pure, unit-tested).
 *
 * While dragging a part, each axis is pulled onto the NEAREST snap candidate
 * within tolerance — like SolidWorks inference / Figma smart guides. With
 * part extents available, candidates per axis are:
 *
 *   center-align : moved.center == other.center
 *   face-touch   : moved face touches other face (center gap = halfA + halfB)
 *   face-flush   : moved face flush with other face (center gap = |halfA - halfB|)
 *
 * Without extents it degrades to center-align only. Axes that don't snap fall
 * back to grid quantization. `free` (Alt held) bypasses both.
 */

export interface Vec3Like { x: number; y: number; z: number }

export type SnapAxis = 'x' | 'y' | 'z';

export type SnapKind = 'center' | 'touch' | 'flush';

export interface SnapCandidate {
  id: string;
  position: Vec3Like;
  /** Half-extent of the part along each axis (optional — enables face snaps) */
  halfExtents?: Vec3Like;
}

export interface SnapGuide {
  axis: SnapAxis;
  kind: SnapKind;
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

/**
 * Half-extents of a primitive along world x/y/z from its feature params,
 * including the part's scale. Falls back to a cube of side ∛V-ish (50) when
 * dimensions are unknown (mesh imports).
 */
export function primitiveHalfExtents(
  primitiveType: string | undefined,
  params: Record<string, unknown>,
  scale: Vec3Like,
): Vec3Like {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
  let w = 50, h = 50, d = 50;
  switch (primitiveType) {
    case 'box':
    case 'wedge':
      w = n(params.width, 50); h = n(params.height, 50); d = n(params.depth, 50);
      break;
    case 'cylinder':
    case 'cone':
    case 'tube': {
      const r2 = n(params.radius, 25) * 2;
      w = r2; d = r2; h = n(params.height, 50);
      break;
    }
    case 'sphere': {
      const r2 = n(params.radius, 25) * 2;
      w = r2; h = r2; d = r2;
      break;
    }
    case 'torus': {
      const outer = (n(params.radius, 25) + n(params.tubeRadius, 8)) * 2;
      w = outer; d = outer; h = n(params.tubeRadius, 8) * 2;
      break;
    }
  }
  return {
    x: (w / 2) * Math.abs(scale.x || 1),
    y: (h / 2) * Math.abs(scale.y || 1),
    z: (d / 2) * Math.abs(scale.z || 1),
  };
}

interface AxisCandidate { value: number; kind: SnapKind; owner: SnapCandidate }

function axisCandidates(
  axis: SnapAxis,
  other: SnapCandidate,
  movedHalf: Vec3Like | undefined,
): AxisCandidate[] {
  const c = other.position[axis];
  const out: AxisCandidate[] = [{ value: c, kind: 'center', owner: other }];
  const oh = other.halfExtents?.[axis];
  const mh = movedHalf?.[axis];
  if (oh !== undefined && mh !== undefined) {
    const touch = oh + mh;
    const flush = Math.abs(oh - mh);
    out.push({ value: c + touch, kind: 'touch', owner: other });
    out.push({ value: c - touch, kind: 'touch', owner: other });
    if (flush > 1e-9) {
      out.push({ value: c + flush, kind: 'flush', owner: other });
      out.push({ value: c - flush, kind: 'flush', owner: other });
    }
  }
  return out;
}

export function alignSnapPosition(
  tentative: Vec3Like,
  others: SnapCandidate[],
  opts: {
    tolerance: number;
    gridSnap: number;
    snapEnabled: boolean;
    free: boolean;
    /** Half-extents of the part being moved (enables face-touch/flush snaps) */
    movedHalfExtents?: Vec3Like;
  },
): AlignSnapResult {
  const t = { ...tentative };
  const snapped: Partial<Record<SnapAxis, { kind: SnapKind; owner: SnapCandidate }>> = {};

  if (opts.snapEnabled && !opts.free) {
    for (const axis of AXES) {
      let best: AxisCandidate | null = null;
      let bestDist = opts.tolerance;
      for (const other of others) {
        for (const cand of axisCandidates(axis, other, opts.movedHalfExtents)) {
          const dist = Math.abs(t[axis] - cand.value);
          if (dist < bestDist) { best = cand; bestDist = dist; }
        }
      }
      if (best) {
        t[axis] = best.value;
        snapped[axis] = { kind: best.kind, owner: best.owner };
      }
    }
  }

  // Unsnapped axes keep grid quantization; free placement skips it entirely.
  const grid = Math.max(1e-9, opts.gridSnap);
  const q = (axis: SnapAxis) =>
    snapped[axis] || opts.free ? t[axis] : Math.round(t[axis] / grid) * grid;
  const position = { x: q('x'), y: q('y'), z: q('z') };

  const guides = (Object.keys(snapped) as SnapAxis[]).map(axis => ({
    axis,
    kind: snapped[axis]!.kind,
    a: position,
    b: snapped[axis]!.owner.position,
  }));

  return { position, guides };
}
