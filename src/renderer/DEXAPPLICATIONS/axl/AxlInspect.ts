// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Inspect — professional CAD analysis helpers (pure, deterministic)
//
//   • partBoundingRadius — conservative bounding-sphere radius for a part,
//     derived from its primitive's dimensions and uniform/non-uniform scale.
//   • detectInterferences — broad-phase bounding-volume interference /
//     clearance check across an assembly. This is exactly the first pass a
//     real interference checker runs before any expensive mesh-mesh test.
//   • snapshotConfiguration / configurationFromParts — capture and restore
//     part placement + driving geometry for Design Variants.
//
// Kept side-effect free so it is unit-testable and cheap to call on demand.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  Part, PrimitiveType, InterferencePair, ConfigurationPart,
} from './types';

/**
 * Conservative bounding-sphere radius (in model units) enclosing a part's
 * primitive, scaled by the part transform. Uses the primitive's largest
 * half-extent so the sphere always contains the solid (broad-phase safe).
 */
export function partBoundingRadius(part: Part): number {
  const feat = part.features.find(f => f.type === 'primitive') || part.features[0];
  const p = (feat?.params || {}) as Record<string, number>;
  const type = (feat?.params?.primitiveType as PrimitiveType) || 'box';
  let half = 25; // sensible default half-extent
  switch (type) {
    case 'box':
    case 'wedge':
      half = Math.hypot((p.width || 50) / 2, (p.height || 50) / 2, (p.depth || 50) / 2);
      break;
    case 'cylinder':
    case 'cone':
      half = Math.hypot(p.radius || 25, (p.height || 50) / 2);
      break;
    case 'tube':
      half = Math.hypot(p.outerRadius || 25, (p.height || 50) / 2);
      break;
    case 'sphere':
      half = p.radius || 25;
      break;
    case 'torus':
      half = (p.ringRadius || 30) + (p.tubeRadius || 10);
      break;
    default:
      half = 25;
  }
  // Largest axis scale grows the bounding sphere; never let it collapse to 0.
  const s = part.transform.scale;
  const maxScale = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z), 0.001);
  return half * maxScale;
}

/** Euclidean distance between two part centroids (world position). */
function centerDistance(a: Part, b: Part): number {
  const pa = a.transform.position, pb = b.transform.position;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

/**
 * Broad-phase interference/clearance scan over every unique part pair.
 *
 * @param parts        assembly parts (only visible ones are tested)
 * @param clearance    minimum allowed gap; pairs closer than this (but not
 *                     overlapping) are reported as a clearance violation.
 * @returns the interfering pairs first (largest overlap first), then any
 *          clearance violations (smallest gap first).
 */
export function detectInterferences(parts: Part[], clearance = 0): InterferencePair[] {
  const visible = parts.filter(p => p.visible);
  const radii = new Map<string, number>();
  visible.forEach(p => radii.set(p.id, partBoundingRadius(p)));

  const out: InterferencePair[] = [];
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i], b = visible[j];
      const dist = centerDistance(a, b);
      const sumR = (radii.get(a.id) || 0) + (radii.get(b.id) || 0);
      const overlap = sumR - dist; // >0 => bounding spheres intersect
      const gap = -overlap;        // >0 => separated by this gap
      const interfering = overlap > 1e-4;
      const clearanceViolation = !interfering && clearance > 0 && gap < clearance;
      if (interfering || clearanceViolation) {
        out.push({
          partAId: a.id, partBId: b.id,
          partAName: a.name, partBName: b.name,
          centerDistance: dist,
          sumRadii: sumR,
          overlap,
          status: interfering ? 'interference' : 'clearance',
        });
      }
    }
  }
  // Interferences first (worst overlap on top), then clearance (tightest gap).
  return out.sort((x, y) => {
    if (x.status !== y.status) return x.status === 'interference' ? -1 : 1;
    return y.overlap - x.overlap;
  });
}

/** Snapshot the current part placement + driving geometry for a configuration. */
export function snapshotConfiguration(parts: Part[]): ConfigurationPart[] {
  return parts.map(p => {
    const feat = p.features.find(f => f.type === 'primitive') || p.features[0];
    return {
      partId: p.id,
      transform: {
        position: { ...p.transform.position },
        rotation: { ...p.transform.rotation },
        scale: { ...p.transform.scale },
      },
      params: { ...(feat?.params || {}) },
      visible: p.visible,
    };
  });
}
