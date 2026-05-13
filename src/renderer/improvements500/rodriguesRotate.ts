// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Rodrigues' axis-angle vector rotation. Rotates vector v around unit axis
 * a by angle theta (radians). If the axis is not unit-length it is
 * normalized first.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface RodriguesVec3 {
  x: number;
  y: number;
  z: number;
}

export function rodriguesRotate(
  v: RodriguesVec3,
  axis: RodriguesVec3,
  theta: number,
): RodriguesVec3 {
  const len = Math.hypot(axis.x, axis.y, axis.z);
  if (len === 0) return { ...v };
  const ax = axis.x / len;
  const ay = axis.y / len;
  const az = axis.z / len;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dot = ax * v.x + ay * v.y + az * v.z;
  const cx = ay * v.z - az * v.y;
  const cy = az * v.x - ax * v.z;
  const cz = ax * v.y - ay * v.x;
  return {
    x: v.x * cos + cx * sin + ax * dot * (1 - cos),
    y: v.y * cos + cy * sin + ay * dot * (1 - cos),
    z: v.z * cos + cz * sin + az * dot * (1 - cos),
  };
}
