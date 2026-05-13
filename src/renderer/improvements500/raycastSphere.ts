// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Ray-sphere intersection. Returns the distance(s) along the ray, or null if miss.
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RaycastSphereHit {
  t1: number; // near
  t2: number; // far
}

export function raycastSphere(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  radius: number,
): RaycastSphereHit | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const a = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z;
  const b = 2 * (direction.x * ox + direction.y * oy + direction.z * oz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  return { t1, t2 };
}
