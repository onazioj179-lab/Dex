// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 4-connected flood fill on a grid. Returns the indices of cells with the
 * matching original color. Out-of-bounds and mismatched cells are ignored.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function floodFill4(
  grid: Uint8Array | Uint8ClampedArray | Uint16Array | Uint32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  newColor: number,
): number[] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return [];
  const target = grid[startY * width + startX]!;
  if (target === newColor) return [];
  const visited: number[] = [];
  const stack: number[] = [startX, startY];
  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const idx = y * width + x;
    if (grid[idx] !== target) continue;
    grid[idx] = newColor;
    visited.push(idx);
    stack.push(x + 1, y);
    stack.push(x - 1, y);
    stack.push(x, y + 1);
    stack.push(x, y - 1);
  }
  return visited;
}
