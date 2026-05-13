// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Continuous-collision detection for two AABBs sweeping with relative velocity.
// Returns the entry time t in [0,1] and the separating-axis normal, or null.
export interface Aabb {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

export interface SweptAabbHit {
  t: number;
  normal: { x: number; y: number };
}

export function sweptAabb(
  a: Aabb,
  velocity: { x: number; y: number },
  b: Aabb,
): SweptAabbHit | null {
  let xInvEntry: number;
  let xInvExit: number;
  let yInvEntry: number;
  let yInvExit: number;
  if (velocity.x > 0) {
    xInvEntry = b.min.x - a.max.x;
    xInvExit = b.max.x - a.min.x;
  } else {
    xInvEntry = b.max.x - a.min.x;
    xInvExit = b.min.x - a.max.x;
  }
  if (velocity.y > 0) {
    yInvEntry = b.min.y - a.max.y;
    yInvExit = b.max.y - a.min.y;
  } else {
    yInvEntry = b.max.y - a.min.y;
    yInvExit = b.min.y - a.max.y;
  }
  const xEntry = velocity.x === 0 ? -Infinity : xInvEntry / velocity.x;
  const xExit = velocity.x === 0 ? Infinity : xInvExit / velocity.x;
  const yEntry = velocity.y === 0 ? -Infinity : yInvEntry / velocity.y;
  const yExit = velocity.y === 0 ? Infinity : yInvExit / velocity.y;
  const entryTime = Math.max(xEntry, yEntry);
  const exitTime = Math.min(xExit, yExit);
  if (entryTime > exitTime || (xEntry < 0 && yEntry < 0) || xEntry > 1 || yEntry > 1) return null;
  let nx = 0;
  let ny = 0;
  if (xEntry > yEntry) nx = velocity.x > 0 ? -1 : 1;
  else ny = velocity.y > 0 ? -1 : 1;
  return { t: entryTime, normal: { x: nx, y: ny } };
}
