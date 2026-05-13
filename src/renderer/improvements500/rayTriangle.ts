// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Moller-Trumbore ray-triangle intersection. Returns barycentric (u, v) and
 * ray parameter t, or null on miss / parallel.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface MollerVec3 {
  x: number;
  y: number;
  z: number;
}

export interface MollerTrumboreHit {
  t: number;
  u: number;
  v: number;
}

const EPSILON = 1e-9;

function sub(a: MollerVec3, b: MollerVec3): MollerVec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: MollerVec3, b: MollerVec3): MollerVec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: MollerVec3, b: MollerVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function rayTriangleIntersect(
  origin: MollerVec3,
  direction: MollerVec3,
  v0: MollerVec3,
  v1: MollerVec3,
  v2: MollerVec3,
): MollerTrumboreHit | null {
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const h = cross(direction, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < EPSILON) return null;
  const invDet = 1 / det;
  const s = sub(origin, v0);
  const u = invDet * dot(s, h);
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = invDet * dot(direction, q);
  if (v < 0 || u + v > 1) return null;
  const t = invDet * dot(e2, q);
  if (t < 0) return null;
  return { t, u, v };
}
