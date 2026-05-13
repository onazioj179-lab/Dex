// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cohen-Sutherland line clipping against an axis-aligned rectangle.
 * Returns the clipped segment, or null if the line lies entirely outside.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface ClipRect {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface ClippedSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

function outcode(x: number, y: number, r: ClipRect): number {
  let code = INSIDE;
  if (x < r.xMin) code |= LEFT;
  else if (x > r.xMax) code |= RIGHT;
  if (y < r.yMin) code |= BOTTOM;
  else if (y > r.yMax) code |= TOP;
  return code;
}

export function cohenSutherlandClip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: ClipRect,
): ClippedSegment | null {
  let oc0 = outcode(x0, y0, rect);
  let oc1 = outcode(x1, y1, rect);

  for (;;) {
    if ((oc0 | oc1) === 0) {
      return { x0, y0, x1, y1 };
    }
    if ((oc0 & oc1) !== 0) {
      return null;
    }
    const oc = oc0 !== 0 ? oc0 : oc1;
    let x = 0;
    let y = 0;
    if ((oc & TOP) !== 0) {
      x = x0 + ((x1 - x0) * (rect.yMax - y0)) / (y1 - y0);
      y = rect.yMax;
    } else if ((oc & BOTTOM) !== 0) {
      x = x0 + ((x1 - x0) * (rect.yMin - y0)) / (y1 - y0);
      y = rect.yMin;
    } else if ((oc & RIGHT) !== 0) {
      y = y0 + ((y1 - y0) * (rect.xMax - x0)) / (x1 - x0);
      x = rect.xMax;
    } else if ((oc & LEFT) !== 0) {
      y = y0 + ((y1 - y0) * (rect.xMin - x0)) / (x1 - x0);
      x = rect.xMin;
    }
    if (oc === oc0) {
      x0 = x;
      y0 = y;
      oc0 = outcode(x0, y0, rect);
    } else {
      x1 = x;
      y1 = y;
      oc1 = outcode(x1, y1, rect);
    }
  }
}
