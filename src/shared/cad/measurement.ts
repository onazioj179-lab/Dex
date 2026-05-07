// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave F v4.0.1 - AXL CAD measurement + BOM helpers.

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

// ---------- Measurement ----------

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function angleBetween(a: Vec2, b: Vec2, c: Vec2): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m1 = Math.hypot(v1.x, v1.y);
  const m2 = Math.hypot(v2.x, v2.y);
  if (m1 === 0 || m2 === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
}

export function polygonArea(pts: ReadonlyArray<Vec2>): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += (a.x * b.y - b.x * a.y);
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(pts: ReadonlyArray<Vec2>): number {
  if (pts.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    s += distance2(pts[i], pts[(i + 1) % pts.length]);
  }
  return s;
}

export function polygonCentroid(pts: ReadonlyArray<Vec2>): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
    a2 += cross;
  }
  if (a2 === 0) {
    const sum = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}

// Mesh volume by signed tetrahedra (winding-CCW assumption).
export function meshVolume(triangles: ReadonlyArray<[Vec3, Vec3, Vec3]>): number {
  let v = 0;
  for (const [a, b, c] of triangles) {
    v += (a.x * (b.y * c.z - c.y * b.z) -
          a.y * (b.x * c.z - c.x * b.z) +
          a.z * (b.x * c.y - c.x * b.y)) / 6;
  }
  return Math.abs(v);
}

export function meshSurfaceArea(triangles: ReadonlyArray<[Vec3, Vec3, Vec3]>): number {
  let s = 0;
  for (const [a, b, c] of triangles) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    s += Math.hypot(cx, cy, cz) / 2;
  }
  return s;
}

export function boundingBox3(pts: ReadonlyArray<Vec3>): { min: Vec3; max: Vec3 } | null {
  if (pts.length === 0) return null;
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of pts) {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}

// ---------- Unit conversion ----------

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

const TO_MM: Readonly<Record<LengthUnit, number>> = Object.freeze({
  mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8,
});

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  return (value * TO_MM[from]) / TO_MM[to];
}

// ---------- Tolerance / GD&T ----------

export type ToleranceClass = 'fine' | 'medium' | 'coarse' | 'very_coarse';

export interface ToleranceTable { upToMm: number; toleranceMm: number }

export const ISO_2768_LINEAR: Readonly<Record<ToleranceClass, ReadonlyArray<ToleranceTable>>> = Object.freeze({
  fine:        [{ upToMm: 3, toleranceMm: 0.05 }, { upToMm: 6, toleranceMm: 0.05 }, { upToMm: 30, toleranceMm: 0.1 }, { upToMm: 120, toleranceMm: 0.15 }, { upToMm: 400, toleranceMm: 0.2 }, { upToMm: 1000, toleranceMm: 0.3 }],
  medium:      [{ upToMm: 3, toleranceMm: 0.1 },  { upToMm: 6, toleranceMm: 0.1 },  { upToMm: 30, toleranceMm: 0.2 }, { upToMm: 120, toleranceMm: 0.3 },  { upToMm: 400, toleranceMm: 0.5 }, { upToMm: 1000, toleranceMm: 0.8 }],
  coarse:      [{ upToMm: 3, toleranceMm: 0.2 },  { upToMm: 6, toleranceMm: 0.3 },  { upToMm: 30, toleranceMm: 0.5 }, { upToMm: 120, toleranceMm: 0.8 },  { upToMm: 400, toleranceMm: 1.2 }, { upToMm: 1000, toleranceMm: 2.0 }],
  very_coarse: [{ upToMm: 3, toleranceMm: 0.5 },  { upToMm: 6, toleranceMm: 0.5 },  { upToMm: 30, toleranceMm: 1.0 }, { upToMm: 120, toleranceMm: 1.5 },  { upToMm: 400, toleranceMm: 2.5 }, { upToMm: 1000, toleranceMm: 4.0 }],
});

export function toleranceFor(nominalMm: number, cls: ToleranceClass): number {
  const table = ISO_2768_LINEAR[cls];
  for (const row of table) if (Math.abs(nominalMm) <= row.upToMm) return row.toleranceMm;
  return table[table.length - 1].toleranceMm;
}

// ---------- BOM ----------

export interface BomItem {
  partNumber: string;
  description: string;
  quantity: number;
  unitMass?: number;
  unitCost?: number;
  material?: string;
}

export interface BomSummary {
  totalParts: number;
  totalQuantity: number;
  totalMass: number;
  totalCost: number;
  byMaterial: Record<string, { quantity: number; mass: number; cost: number }>;
}

export function summariseBom(items: ReadonlyArray<BomItem>): BomSummary {
  const summary: BomSummary = {
    totalParts: items.length,
    totalQuantity: 0,
    totalMass: 0,
    totalCost: 0,
    byMaterial: {},
  };
  for (const it of items) {
    const qty = Math.max(0, it.quantity);
    const mass = (it.unitMass ?? 0) * qty;
    const cost = (it.unitCost ?? 0) * qty;
    summary.totalQuantity += qty;
    summary.totalMass += mass;
    summary.totalCost += cost;
    const key = it.material ?? 'unspecified';
    if (!summary.byMaterial[key]) summary.byMaterial[key] = { quantity: 0, mass: 0, cost: 0 };
    summary.byMaterial[key].quantity += qty;
    summary.byMaterial[key].mass += mass;
    summary.byMaterial[key].cost += cost;
  }
  return summary;
}

// ---------- Drill / hole math ----------

export function drillPattern(centerX: number, centerY: number, radius: number, count: number, startAngleDeg = 0): Vec2[] {
  if (count <= 0) return [];
  const out: Vec2[] = [];
  const step = (Math.PI * 2) / count;
  const start = (startAngleDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = start + i * step;
    out.push({ x: centerX + Math.cos(a) * radius, y: centerY + Math.sin(a) * radius });
  }
  return out;
}
