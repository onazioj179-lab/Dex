// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Marching squares contour extraction at a single iso-level. Returns line
 * segments as flat [x0,y0,x1,y1, ...] in image coordinates.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
function lerp(p1: number, p2: number, v1: number, v2: number, iso: number): number {
  if (v1 === v2) return p1;
  return p1 + ((iso - v1) / (v2 - v1)) * (p2 - p1);
}

export function marchingSquares(
  field: ArrayLike<number>,
  width: number,
  height: number,
  iso: number,
): number[] {
  const segs: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const v0 = field[y * width + x]!;
      const v1 = field[y * width + x + 1]!;
      const v2 = field[(y + 1) * width + x + 1]!;
      const v3 = field[(y + 1) * width + x]!;
      let idx = 0;
      if (v0 >= iso) idx |= 1;
      if (v1 >= iso) idx |= 2;
      if (v2 >= iso) idx |= 4;
      if (v3 >= iso) idx |= 8;
      if (idx === 0 || idx === 15) continue;

      const tx = lerp(x, x + 1, v0, v1, iso);
      const rx = x + 1;
      const ry = lerp(y, y + 1, v1, v2, iso);
      const bx = lerp(x, x + 1, v3, v2, iso);
      const lx = x;
      const ly = lerp(y, y + 1, v0, v3, iso);
      const ty = y;
      const by = y + 1;

      const top: [number, number] = [tx, ty];
      const right: [number, number] = [rx, ry];
      const bottom: [number, number] = [bx, by];
      const left: [number, number] = [lx, ly];

      const push = (a: [number, number], b: [number, number]): void => {
        segs.push(a[0], a[1], b[0], b[1]);
      };

      switch (idx) {
        case 1:
        case 14:
          push(left, top);
          break;
        case 2:
        case 13:
          push(top, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(right, bottom);
          break;
        case 5:
          push(left, top);
          push(right, bottom);
          break;
        case 6:
        case 9:
          push(top, bottom);
          break;
        case 7:
        case 8:
          push(left, bottom);
          break;
        case 10:
          push(top, right);
          push(left, bottom);
          break;
      }
    }
  }
  return segs;
}
