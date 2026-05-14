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

// ---- DXF parser ----
//
// Minimal but real DXF reader. DXF is a paired-group ASCII format: lines come
// in pairs of (group code, value). Group code 0 starts a new top-level item;
// the next line is the item type ("SECTION", "ENDSEC", "LINE", "CIRCLE", ...).
// Codes 10/20/30 = X/Y/Z of primary point; 11/21/31 = secondary point;
// 40 = radius / first float; 50/51 = start/end angles; 1 = text value;
// 8 = layer name; 70 = flags.
//
// We only walk the ENTITIES section and extract LINE, CIRCLE, ARC, LWPOLYLINE,
// POLYLINE/VERTEX, and TEXT/MTEXT. Everything else is ignored. Coordinates
// are returned as plain numbers; bad entities are skipped silently rather
// than throwing — DXF in the wild is messy.

export type DxfEntity =
  | { type: 'LINE'; layer: string; start: [number, number, number]; end: [number, number, number] }
  | { type: 'CIRCLE'; layer: string; center: [number, number, number]; radius: number }
  | { type: 'ARC'; layer: string; center: [number, number, number]; radius: number; startAngle: number; endAngle: number }
  | { type: 'POLYLINE'; layer: string; vertices: Array<[number, number, number]>; closed: boolean }
  | { type: 'TEXT'; layer: string; position: [number, number, number]; value: string };

export interface DxfDocument {
  entities: DxfEntity[];
}

interface DxfPair { code: number; value: string }

function tokenizeDxf(src: string): DxfPair[] {
  const lines = src.split(/\r?\n/);
  const out: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: lines[i + 1] ?? '' });
  }
  return out;
}

export function parseDxf(src: string): DxfDocument {
  const pairs = tokenizeDxf(src);
  const entities: DxfEntity[] = [];
  let i = 0;

  // Seek to ENTITIES section. If we never find one (loose entity dumps used
  // by tests + simple exporters), fall back to scanning from the top.
  let foundSection = false;
  while (i < pairs.length) {
    if (pairs[i].code === 0 && pairs[i].value.trim().toUpperCase() === 'SECTION') {
      const next = pairs[i + 1];
      if (next?.code === 2 && next.value.trim().toUpperCase() === 'ENTITIES') {
        i += 2;
        foundSection = true;
        break;
      }
    }
    i++;
  }
  if (!foundSection) i = 0;

  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === 0 && p.value.trim().toUpperCase() === 'ENDSEC') break;
    if (p.code !== 0) { i++; continue; }
    const type = p.value.trim().toUpperCase();
    i++;

    // Collect codes for this entity until next code-0.
    const fields = new Map<number, string[]>();
    while (i < pairs.length && pairs[i].code !== 0) {
      const arr = fields.get(pairs[i].code) ?? [];
      arr.push(pairs[i].value);
      fields.set(pairs[i].code, arr);
      i++;
    }
    const f = (code: number, idx = 0): string | undefined => fields.get(code)?.[idx];
    const num = (code: number, idx = 0, fallback = 0): number => {
      const v = f(code, idx);
      const n = v === undefined ? NaN : Number.parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const layer = (f(8) ?? '0').trim();

    switch (type) {
      case 'LINE':
        entities.push({
          type: 'LINE',
          layer,
          start: [num(10), num(20), num(30)],
          end: [num(11), num(21), num(31)],
        });
        break;
      case 'CIRCLE':
        entities.push({
          type: 'CIRCLE',
          layer,
          center: [num(10), num(20), num(30)],
          radius: num(40),
        });
        break;
      case 'ARC':
        entities.push({
          type: 'ARC',
          layer,
          center: [num(10), num(20), num(30)],
          radius: num(40),
          startAngle: num(50),
          endAngle: num(51),
        });
        break;
      case 'LWPOLYLINE': {
        const xs = fields.get(10) ?? [];
        const ys = fields.get(20) ?? [];
        const verts: Array<[number, number, number]> = [];
        for (let k = 0; k < Math.min(xs.length, ys.length); k++) {
          const x = Number.parseFloat(xs[k]); const y = Number.parseFloat(ys[k]);
          if (Number.isFinite(x) && Number.isFinite(y)) verts.push([x, y, 0]);
        }
        const flags = num(70, 0, 0);
        entities.push({ type: 'POLYLINE', layer, vertices: verts, closed: (flags & 1) === 1 });
        break;
      }
      case 'POLYLINE': {
        // Old-style POLYLINE: vertices follow as separate VERTEX entities until SEQEND.
        const verts: Array<[number, number, number]> = [];
        const flags = num(70, 0, 0);
        while (i < pairs.length && pairs[i].code === 0) {
          const sub = pairs[i].value.trim().toUpperCase();
          if (sub === 'SEQEND') { i++; break; }
          if (sub !== 'VERTEX') break;
          i++;
          let vx = 0, vy = 0, vz = 0;
          while (i < pairs.length && pairs[i].code !== 0) {
            const c = pairs[i].code; const v = Number.parseFloat(pairs[i].value);
            if (c === 10 && Number.isFinite(v)) vx = v;
            else if (c === 20 && Number.isFinite(v)) vy = v;
            else if (c === 30 && Number.isFinite(v)) vz = v;
            i++;
          }
          verts.push([vx, vy, vz]);
        }
        entities.push({ type: 'POLYLINE', layer, vertices: verts, closed: (flags & 1) === 1 });
        // i already advanced past SEQEND or sits on next code-0 sentinel.
        continue;
      }
      case 'TEXT':
      case 'MTEXT':
        entities.push({
          type: 'TEXT',
          layer,
          position: [num(10), num(20), num(30)],
          value: (f(1) ?? '').replace(/\\P/g, '\n'),
        });
        break;
      default:
        // Unknown entity — already skipped its fields.
        break;
    }
  }

  return { entities };
}

export function countDxfEntities(dxf: string): { lines: number; circles: number; arcs: number; polylines: number; texts: number } {
  const doc = parseDxf(dxf);
  let lines = 0, circles = 0, arcs = 0, polylines = 0, texts = 0;
  for (const e of doc.entities) {
    if (e.type === 'LINE') lines++;
    else if (e.type === 'CIRCLE') circles++;
    else if (e.type === 'ARC') arcs++;
    else if (e.type === 'POLYLINE') polylines++;
    else if (e.type === 'TEXT') texts++;
  }
  return { lines, circles, arcs, polylines, texts };
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
