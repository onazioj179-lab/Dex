// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sutherland-Hodgman polygon clipping against a convex clip polygon.
 * Returns the clipped subject polygon.
 */

export interface ClipPt {
  x: number;
  y: number;
}
type Pt2 = ClipPt;

function inside(p: Pt2, edgeStart: Pt2, edgeEnd: Pt2): boolean {
  // Right side test: positive cross product means p is to the left of edge,
  // which is the interior for CCW clip polygons.
  return (
    (edgeEnd.x - edgeStart.x) * (p.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (p.x - edgeStart.x) >=
    0
  );
}

function intersect(s: Pt2, e: Pt2, edgeStart: Pt2, edgeEnd: Pt2): Pt2 {
  const dc = { x: edgeStart.x - edgeEnd.x, y: edgeStart.y - edgeEnd.y };
  const dp = { x: s.x - e.x, y: s.y - e.y };
  const n1 = edgeStart.x * edgeEnd.y - edgeStart.y * edgeEnd.x;
  const n2 = s.x * e.y - s.y * e.x;
  const denom = dc.x * dp.y - dc.y * dp.x;
  if (denom === 0) return { x: s.x, y: s.y };
  const n3 = 1 / denom;
  return {
    x: (n1 * dp.x - n2 * dc.x) * n3,
    y: (n1 * dp.y - n2 * dc.y) * n3,
  };
}

/**
 * Clip `subject` polygon (any shape) to the interior of convex `clip` polygon.
 * Both polygons must be specified in CCW order. Returns vertex list of result.
 */
export function sutherlandHodgmanClip(
  subject: ReadonlyArray<Pt2>,
  clip: ReadonlyArray<Pt2>,
): Pt2[] {
  let output: Pt2[] = subject.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i < clip.length; i += 1) {
    const edgeStart = clip[i]!;
    const edgeEnd = clip[(i + 1) % clip.length]!;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j]!;
      const prev = input[(j - 1 + input.length) % input.length]!;
      const currIn = inside(current, edgeStart, edgeEnd);
      const prevIn = inside(prev, edgeStart, edgeEnd);
      if (currIn) {
        if (!prevIn) output.push(intersect(prev, current, edgeStart, edgeEnd));
        output.push(current);
      } else if (prevIn) {
        output.push(intersect(prev, current, edgeStart, edgeEnd));
      }
    }
    if (output.length === 0) return output;
  }
  return output;
}
