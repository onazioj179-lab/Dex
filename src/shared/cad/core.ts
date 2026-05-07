// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - DEX v3.10.0 wave T - CAD + simulation primitives
// =============================================================================

export type Vec2 = readonly [number, number];

// ---- 2D constraint solver: simple gradient descent over constraints ----
export type ConstraintKind = 'coincident'|'distance'|'horizontal'|'vertical'|'parallel'|'perpendicular'|'equal'|'angle'|'tangent'|'concentric'|'fix';
export interface Constraint { kind: ConstraintKind; a: number; b?: number; c?: number; d?: number; value?: number }

export function solveSketch(points: number[], constraints: readonly Constraint[], iterations: number = 200, lr: number = 0.1): number[] {
  const p = points.slice();
  for (let it = 0; it < iterations; it++) {
    const grad = new Array<number>(p.length).fill(0);
    for (const c of constraints) {
      if (c.kind === 'fix') continue;
      const ax = c.a*2, ay = c.a*2+1;
      if (c.kind === 'horizontal' && c.b !== undefined) {
        const by = c.b*2+1;
        const diff = p[ay] - p[by];
        grad[ay] += 2*diff; grad[by] -= 2*diff;
      } else if (c.kind === 'vertical' && c.b !== undefined) {
        const bx = c.b*2;
        const diff = p[ax] - p[bx];
        grad[ax] += 2*diff; grad[bx] -= 2*diff;
      } else if (c.kind === 'coincident' && c.b !== undefined) {
        const bx = c.b*2, by = c.b*2+1;
        grad[ax] += 2*(p[ax]-p[bx]); grad[bx] -= 2*(p[ax]-p[bx]);
        grad[ay] += 2*(p[ay]-p[by]); grad[by] -= 2*(p[ay]-p[by]);
      } else if (c.kind === 'distance' && c.b !== undefined && c.value !== undefined) {
        const bx = c.b*2, by = c.b*2+1;
        const dx = p[ax]-p[bx], dy = p[ay]-p[by];
        const d = Math.hypot(dx, dy);
        if (d === 0) continue;
        const err = d - c.value;
        const f = 2*err/d;
        grad[ax] += f*dx; grad[bx] -= f*dx;
        grad[ay] += f*dy; grad[by] -= f*dy;
      }
    }
    const fixedIdx = new Set(constraints.filter((c) => c.kind === 'fix').map((c) => c.a));
    for (let i = 0; i < p.length / 2; i++) {
      if (fixedIdx.has(i)) continue;
      p[i*2] -= lr * grad[i*2];
      p[i*2+1] -= lr * grad[i*2+1];
    }
  }
  return p;
}

// ---- features ----
export interface ExtrudeFeature { kind: 'extrude'; profileArea: number; depth: number; taperDeg?: number }
export function featureVolume(f: ExtrudeFeature): number {
  if (!f.taperDeg) return f.profileArea * f.depth;
  // simple frustum approximation
  const t = Math.tan(f.taperDeg * Math.PI / 180);
  const top = Math.sqrt(f.profileArea) - 2 * f.depth * t;
  const a2 = top > 0 ? top * top : 0;
  return (f.depth / 3) * (f.profileArea + a2 + Math.sqrt(f.profileArea * a2));
}

export function revolveVolume(profileArea: number, centroidRadius: number, angleDeg: number = 360): number {
  // Pappus theorem
  return profileArea * (2 * Math.PI * centroidRadius) * (angleDeg / 360);
}

// ---- sheet metal K-factor unfold ----
export function bendAllowance(thickness: number, bendAngleDeg: number, bendRadius: number, kFactor: number): number {
  return ((bendAngleDeg * Math.PI) / 180) * (bendRadius + kFactor * thickness);
}

// ---- frame generator: I-beam section moment ----
export function iBeamMomentInertia(b: number, h: number, tw: number, tf: number): number {
  return (b * h * h * h) / 12 - ((b - tw) * (h - 2 * tf) ** 3) / 12;
}

// ---- weld bead leg → throat ----
export function weldThroat(legLength: number): number { return legLength / Math.SQRT2; }

// ---- interference detection: 2 AABBs ----
export interface AABB { min: Vec2; max: Vec2 }
export function aabbIntersect(a: AABB, b: AABB): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] && a.min[1] <= b.max[1] && a.max[1] >= b.min[1];
}

// ---- drawing auto-dim: pick min/max extent ----
export function autoDimensionExtents(points: readonly Vec2[]): { width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
  }
  return { width: maxX - minX, height: maxY - minY };
}

// ---- BOM aggregator ----
export interface BomItem { partNumber: string; quantity: number }
export function aggregateBom(items: readonly BomItem[]): BomItem[] {
  const map = new Map<string, number>();
  for (const it of items) map.set(it.partNumber, (map.get(it.partNumber) ?? 0) + it.quantity);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([partNumber, quantity]) => ({ partNumber, quantity }));
}

// ---- STEP/IGES/DXF parse stub: count entities by simple regex ----
export function countDxfEntities(dxf: string): { lines: number; circles: number; arcs: number; polylines: number } {
  return {
    lines: (dxf.match(/\bLINE\b/g) ?? []).length,
    circles: (dxf.match(/\bCIRCLE\b/g) ?? []).length,
    arcs: (dxf.match(/\bARC\b/g) ?? []).length,
    polylines: (dxf.match(/\bPOLYLINE\b|\bLWPOLYLINE\b/g) ?? []).length,
  };
}

// ---- FEA: 1D bar element stiffness ----
export function barStiffness(youngsModulus: number, area: number, length: number): number {
  if (length <= 0) return 0;
  return (youngsModulus * area) / length;
}

export function beamDeflection(load: number, length: number, youngsModulus: number, momentInertia: number): number {
  // cantilever, point load at tip
  return (load * length ** 3) / (3 * youngsModulus * momentInertia);
}

export function bucklingCriticalLoad(youngsModulus: number, momentInertia: number, length: number, kFactor: number = 1): number {
  return (Math.PI ** 2 * youngsModulus * momentInertia) / (kFactor * length) ** 2;
}

export function modalFrequency(stiffness: number, mass: number): number {
  if (mass <= 0) return 0;
  return Math.sqrt(stiffness / mass) / (2 * Math.PI);
}

export function thermalExpansion(coeff: number, length: number, deltaT: number): number {
  return coeff * length * deltaT;
}

// ---- topology optimization toy: simple density update ----
export function updateDensity(density: number, gradient: number, target: number, lr: number = 0.1): number {
  const next = density - lr * (gradient + (density - target) * 0.01);
  return Math.max(0.01, Math.min(1, next));
}

// ---- CAM: linear toolpath length ----
export function toolpathLength(points: readonly Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i-1][0], points[i][1] - points[i-1][1]);
  }
  return len;
}

export function postProcessGCode(points: readonly Vec2[], feedRate: number): string {
  const lines: string[] = ['G21', 'G90', `F${feedRate}`];
  for (const p of points) lines.push(`G1 X${p[0].toFixed(3)} Y${p[1].toFixed(3)}`);
  lines.push('M30');
  return lines.join('\n');
}
