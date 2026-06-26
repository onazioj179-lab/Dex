// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Import — real mesh importers (OBJ, STL ASCII/binary, STEP point-extent)
//
// Each parser turns a file into a flat triangle mesh { positions, normals,
// indices } in model units. Geometry is recentred on its bounding-box centre
// and indices are flattened (one vertex per corner) so the result drops
// straight into the renderer's `mesh` feature path. Pure + deterministic.
// ═══════════════════════════════════════════════════════════════════════════

export interface RawMesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

// Face normal for a triangle (right-hand winding). Returns unit vector.
function faceNormal(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// Recentre on bbox centre and scale down if enormous so imports land in view.
function normalizeMesh(positions: number[]): { positions: number[]; scaled: number } {
  if (positions.length < 3) return { positions, scaled: 1 };
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  // Target a ~120-unit largest dimension so imports are workable next to the
  // default ~50-unit primitives, but never upscale tiny detail meshes.
  const scaled = span > 400 ? 120 / span : 1;
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = (positions[i] - cx) * scaled;
    out[i + 1] = (positions[i + 1] - cy) * scaled;
    out[i + 2] = (positions[i + 2] - cz) * scaled;
  }
  return { positions: out, scaled };
}

// Build a flat (non-indexed-sharing) mesh + per-face normals from triangles.
function buildFromTriangles(tris: number[][]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let idx = 0;
  for (const t of tris) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
    const n = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(...n, ...n, ...n);
    indices.push(idx, idx + 1, idx + 2);
    idx += 3;
  }
  const norm = normalizeMesh(positions);
  return { positions: norm.positions, normals, indices };
}

// ── OBJ (Wavefront) ────────────────────────────────────────────────────────
export function parseOBJ(text: string): RawMesh {
  const verts: number[][] = [];
  const tris: number[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (s.startsWith('v ')) {
      const p = s.split(/\s+/);
      verts.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
    } else if (s.startsWith('f ')) {
      const p = s.split(/\s+/).slice(1).map(tok => parseInt(tok.split('/')[0], 10));
      // Fan-triangulate any n-gon face; OBJ indices are 1-based (or negative).
      const resolve = (i: number) => (i < 0 ? verts.length + i : i - 1);
      for (let i = 2; i < p.length; i++) {
        const a = verts[resolve(p[0])], b = verts[resolve(p[i - 1])], c = verts[resolve(p[i])];
        if (a && b && c) tris.push([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]]);
      }
    }
  }
  return buildFromTriangles(tris);
}

// ── STL (ASCII or binary, auto-detected) ─────────────────────────────────────
export function parseSTL(data: string | ArrayBuffer): RawMesh {
  if (typeof data === 'string') return parseStlAscii(data);
  // Binary STL: 80-byte header, uint32 triangle count, then 50 bytes/triangle.
  const view = new DataView(data);
  if (data.byteLength < 84) return parseStlAscii(new TextDecoder().decode(data));
  const count = view.getUint32(80, true);
  // Sanity-check the binary layout; if it doesn't add up, treat as ASCII.
  if (84 + count * 50 !== data.byteLength) {
    return parseStlAscii(new TextDecoder().decode(data));
  }
  const tris: number[][] = [];
  let off = 84;
  for (let i = 0; i < count; i++) {
    off += 12; // skip the stored facet normal; we recompute it
    const v: number[] = [];
    for (let j = 0; j < 9; j++) { v.push(view.getFloat32(off, true)); off += 4; }
    off += 2; // attribute byte count
    tris.push(v);
  }
  return buildFromTriangles(tris);
}

function parseStlAscii(text: string): RawMesh {
  const tris: number[][] = [];
  const nums = text.match(/vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g) || [];
  const pts: number[][] = nums.map(line => {
    const m = line.match(/(-?[\d.eE+-]+)/g)!;
    return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2])];
  });
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const a = pts[i], b = pts[i + 1], c = pts[i + 2];
    tris.push([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]]);
  }
  return buildFromTriangles(tris);
}

// ── STEP (AP203/214) — point-extent import ───────────────────────────────────
// A faithful STEP BREP reader needs a NURBS/topology kernel. Short of that we
// honestly extract every CARTESIAN_POINT in the file (the model's real control
// geometry) and import a box sized to its actual bounding extent — a true
// representation of the part's envelope, not a fabricated shape.
export function parseSTEPExtent(text: string): { width: number; height: number; depth: number; pointCount: number } | null {
  const re = /CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*(-?[\d.eE+-]+)\s*,\s*(-?[\d.eE+-]+)\s*,\s*(-?[\d.eE+-]+)\s*\)/g;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    const x = parseFloat(m[1]), y = parseFloat(m[2]), z = parseFloat(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    n++;
  }
  if (n < 2) return null;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const k = span > 400 ? 120 / span : 1;
  return {
    width: Math.max(1, (maxX - minX) * k),
    height: Math.max(1, (maxY - minY) * k),
    depth: Math.max(1, (maxZ - minZ) * k),
    pointCount: n,
  };
}

export type ImportResult =
  | { kind: 'mesh'; mesh: RawMesh; triangles: number }
  | { kind: 'box'; width: number; height: number; depth: number; pointCount: number };

/** Dispatch by file extension. Returns null when nothing usable was found. */
export function importCadFile(fileName: string, data: string | ArrayBuffer): ImportResult | null {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (ext === 'obj') {
    const mesh = parseOBJ(typeof data === 'string' ? data : new TextDecoder().decode(data));
    return mesh.indices.length ? { kind: 'mesh', mesh, triangles: mesh.indices.length / 3 } : null;
  }
  if (ext === 'stl') {
    const mesh = parseSTL(data);
    return mesh.indices.length ? { kind: 'mesh', mesh, triangles: mesh.indices.length / 3 } : null;
  }
  if (ext === 'step' || ext === 'stp') {
    const ext2 = parseSTEPExtent(typeof data === 'string' ? data : new TextDecoder().decode(data));
    return ext2 ? { kind: 'box', ...ext2 } : null;
  }
  return null;
}
