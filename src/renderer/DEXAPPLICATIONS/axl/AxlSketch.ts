// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Sketch — 2D profile -> 3D solid (the parametric-modeling core)
//
//   • profileFromEntities — turn drawn sketch entities (rect / circle / chained
//     lines) into one ordered closed 2D loop.
//   • triangulate (ear clipping) — tessellate any simple polygon.
//   • extrudeSketch / revolveSketch — sweep the profile into a real triangle
//     mesh (caps + walls / surface of revolution) the renderer draws directly.
//
// Pure + deterministic: no DOM, no globals. Output matches the renderer's raw
// `mesh` feature payload { positions, normals, indices } (flat number[]).
// ═══════════════════════════════════════════════════════════════════════════

export interface Pt2 { x: number; y: number }

export type SketchEnt =
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number };

export interface RawMesh { positions: number[]; normals: number[]; indices: number[] }

const EPS = 1e-4;

// ── Profile extraction ─────────────────────────────────────────────────────

function circleLoop(cx: number, cy: number, r: number, seg = 48): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** Chain `line` entities into one closed loop by matching shared endpoints. */
function chainLines(lines: Extract<SketchEnt, { kind: 'line' }>[]): Pt2[] | null {
  if (lines.length < 3) return null;
  const close = (a: Pt2, b: Pt2) => Math.hypot(a.x - b.x, a.y - b.y) < 1.0;
  const segs = lines.map(l => ({ a: { x: l.x0, y: l.y0 }, b: { x: l.x1, y: l.y1 }, used: false }));
  const loop: Pt2[] = [segs[0].a, segs[0].b];
  segs[0].used = true;
  for (let guard = 0; guard < segs.length + 2; guard++) {
    const tail = loop[loop.length - 1];
    const next = segs.find(s => !s.used && (close(s.a, tail) || close(s.b, tail)));
    if (!next) break;
    next.used = true;
    loop.push(close(next.a, tail) ? next.b : next.a);
  }
  // Drop the duplicated closing vertex if the loop returned to the start.
  if (loop.length >= 4 && close(loop[0], loop[loop.length - 1])) loop.pop();
  return loop.length >= 3 ? loop : null;
}

/**
 * One ordered closed loop from the drawn entities. A rect or circle wins (they
 * are unambiguous closed profiles); otherwise chained lines form the loop.
 */
export function profileFromEntities(ents: SketchEnt[]): Pt2[] | null {
  const rect = ents.find(e => e.kind === 'rect') as Extract<SketchEnt, { kind: 'rect' }> | undefined;
  if (rect) {
    const { x0, y0, x1, y1 } = rect;
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }
  const circ = ents.find(e => e.kind === 'circle') as Extract<SketchEnt, { kind: 'circle' }> | undefined;
  if (circ) return circleLoop(circ.cx, circ.cy, circ.r);
  const lines = ents.filter(e => e.kind === 'line') as Extract<SketchEnt, { kind: 'line' }>[];
  return chainLines(lines);
}

// ── Polygon helpers ────────────────────────────────────────────────────────

function signedArea(p: Pt2[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return a / 2;
}

function pointInTri(p: Pt2, a: Pt2, b: Pt2, c: Pt2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Ear-clipping triangulation of a simple polygon. Returns index triples. */
export function triangulate(poly: Pt2[]): number[][] {
  const n = poly.length;
  if (n < 3) return [];
  // Work CCW so the convex test is consistent.
  const ccw = signedArea(poly) > 0 ? poly : [...poly].reverse();
  const flip = signedArea(poly) <= 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  const tris: number[][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ai = idx[(i + idx.length - 1) % idx.length];
      const bi = idx[i];
      const ci = idx[(i + 1) % idx.length];
      const A = ccw[ai], B = ccw[bi], C = ccw[ci];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      if (cross <= EPS) continue; // reflex or degenerate
      let contains = false;
      for (let j = 0; j < idx.length; j++) {
        const pj = idx[j];
        if (pj === ai || pj === bi || pj === ci) continue;
        if (pointInTri(ccw[pj], A, B, C)) { contains = true; break; }
      }
      if (contains) continue;
      tris.push([ai, bi, ci]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate guard
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  // Map indices back to the original ordering if we reversed.
  if (flip) return tris.map(t => t.map(k => n - 1 - k));
  return tris;
}

// ── Recentre + bounds ──────────────────────────────────────────────────────

function centreLoop(loop: Pt2[]): { loop: Pt2[]; cx: number; cy: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of loop) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { loop: loop.map(p => ({ x: p.x - cx, y: p.y - cy })), cx, cy };
}

// ── Extrude ────────────────────────────────────────────────────────────────

/**
 * Sweep a closed 2D profile along +/-Z by `depth`. Builds top + bottom caps
 * (triangulated) and side walls with outward face normals. Profile is recentred
 * on its bbox so the part sits at the origin like the primitives.
 */
export function extrudeSketch(ents: SketchEnt[], depth: number): RawMesh | null {
  const raw = profileFromEntities(ents);
  if (!raw || raw.length < 3) return null;
  const { loop } = centreLoop(raw);
  const d = Math.max(1, depth) / 2;
  const tris = triangulate(loop);
  if (tris.length === 0) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let v = 0;
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions.push(x, y, z); normals.push(nx, ny, nz); return v++;
  };

  // Top cap (+Z, CCW) and bottom cap (-Z, reversed winding).
  for (const [a, b, c] of tris) {
    const i0 = push(loop[a].x, loop[a].y, d, 0, 0, 1);
    const i1 = push(loop[b].x, loop[b].y, d, 0, 0, 1);
    const i2 = push(loop[c].x, loop[c].y, d, 0, 0, 1);
    indices.push(i0, i1, i2);
    const j0 = push(loop[a].x, loop[a].y, -d, 0, 0, -1);
    const j1 = push(loop[b].x, loop[b].y, -d, 0, 0, -1);
    const j2 = push(loop[c].x, loop[c].y, -d, 0, 0, -1);
    indices.push(j0, j2, j1);
  }

  // Side walls — one quad per edge, normal = outward edge perpendicular.
  const n = loop.length;
  const ccw = signedArea(loop) > 0; // outward = right-hand of the edge dir
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    let nx = q.y - p.y, ny = -(q.x - p.x);
    if (!ccw) { nx = -nx; ny = -ny; }
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const a = push(p.x, p.y, d, nx, ny, 0);
    const b = push(q.x, q.y, d, nx, ny, 0);
    const c = push(q.x, q.y, -d, nx, ny, 0);
    const e = push(p.x, p.y, -d, nx, ny, 0);
    indices.push(a, b, c, a, c, e);
  }

  return { positions, normals, indices };
}

/**
 * Revolve a closed 2D profile around the Y axis by `angle` degrees into a
 * surface-of-revolution solid. The profile's X is the radius, Y the height.
 */
export function revolveSketch(ents: SketchEnt[], angleDeg = 360, seg = 48): RawMesh | null {
  const raw = profileFromEntities(ents);
  if (!raw || raw.length < 3) return null;
  const { loop } = centreLoop(raw);
  const ang = (Math.min(360, Math.max(10, angleDeg)) * Math.PI) / 180;
  const steps = Math.max(8, Math.round((seg * ang) / (Math.PI * 2)));
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = loop.length;
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * ang;
    const ct = Math.cos(t), st = Math.sin(t);
    for (let i = 0; i < n; i++) {
      const r = Math.abs(loop[i].x);
      const y = loop[i].y;
      positions.push(r * ct, y, r * st);
      normals.push(ct, 0, st);
    }
  }
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      const a = s * n + i;
      const b = s * n + ((i + 1) % n);
      const c = (s + 1) * n + i;
      const dd = (s + 1) * n + ((i + 1) % n);
      indices.push(a, b, c, b, dd, c);
    }
  }
  return { positions, normals, indices };
}

// ── Snapping ───────────────────────────────────────────────────────────────

/** Snap a point to the grid and to any nearby existing endpoint. */
export function snapSketchPoint(p: Pt2, grid: number, ents: SketchEnt[], snapPx = 8): Pt2 {
  // Endpoint snap first (stronger).
  const eps: Pt2[] = [];
  for (const e of ents) {
    if (e.kind === 'line') { eps.push({ x: e.x0, y: e.y0 }, { x: e.x1, y: e.y1 }); }
    else if (e.kind === 'rect') { eps.push({ x: e.x0, y: e.y0 }, { x: e.x1, y: e.y0 }, { x: e.x1, y: e.y1 }, { x: e.x0, y: e.y1 }); }
    else if (e.kind === 'circle') { eps.push({ x: e.cx, y: e.cy }); }
  }
  for (const ep of eps) { if (Math.hypot(ep.x - p.x, ep.y - p.y) <= snapPx) return { ...ep }; }
  if (grid > 0) return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
  return { ...p };
}
