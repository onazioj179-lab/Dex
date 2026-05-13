// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Point octree with axis-aligned box range queries.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface OctreePoint {
  x: number;
  y: number;
  z: number;
}

export interface OctreeBounds {
  xMin: number;
  yMin: number;
  zMin: number;
  xMax: number;
  yMax: number;
  zMax: number;
}

export class Octree<P extends OctreePoint> {
  private bounds: OctreeBounds;
  private capacity: number;
  private points: P[] = [];
  private children: Octree<P>[] = [];

  constructor(bounds: OctreeBounds, capacity = 8) {
    this.bounds = bounds;
    this.capacity = capacity;
  }

  insert(p: P): boolean {
    if (!this.contains(this.bounds, p)) return false;
    if (this.children.length === 0 && this.points.length < this.capacity) {
      this.points.push(p);
      return true;
    }
    if (this.children.length === 0) this.subdivide();
    for (const c of this.children) if (c.insert(p)) return true;
    return false;
  }

  query(range: OctreeBounds, out: P[] = []): P[] {
    if (!this.intersects(range)) return out;
    for (const p of this.points) if (this.contains(range, p)) out.push(p);
    for (const c of this.children) c.query(range, out);
    return out;
  }

  private contains(b: OctreeBounds, p: OctreePoint): boolean {
    return (
      p.x >= b.xMin &&
      p.x <= b.xMax &&
      p.y >= b.yMin &&
      p.y <= b.yMax &&
      p.z >= b.zMin &&
      p.z <= b.zMax
    );
  }

  private intersects(b: OctreeBounds): boolean {
    return !(
      b.xMin > this.bounds.xMax ||
      b.xMax < this.bounds.xMin ||
      b.yMin > this.bounds.yMax ||
      b.yMax < this.bounds.yMin ||
      b.zMin > this.bounds.zMax ||
      b.zMax < this.bounds.zMin
    );
  }

  private subdivide(): void {
    const { xMin, yMin, zMin, xMax, yMax, zMax } = this.bounds;
    const mx = (xMin + xMax) / 2;
    const my = (yMin + yMax) / 2;
    const mz = (zMin + zMax) / 2;
    const ranges: OctreeBounds[] = [
      { xMin, yMin, zMin, xMax: mx, yMax: my, zMax: mz },
      { xMin: mx, yMin, zMin, xMax, yMax: my, zMax: mz },
      { xMin, yMin: my, zMin, xMax: mx, yMax, zMax: mz },
      { xMin: mx, yMin: my, zMin, xMax, yMax, zMax: mz },
      { xMin, yMin, zMin: mz, xMax: mx, yMax: my, zMax },
      { xMin: mx, yMin, zMin: mz, xMax, yMax: my, zMax },
      { xMin, yMin: my, zMin: mz, xMax: mx, yMax, zMax },
      { xMin: mx, yMin: my, zMin: mz, xMax, yMax, zMax },
    ];
    this.children = ranges.map((r) => new Octree<P>(r, this.capacity));
    const existing = this.points;
    this.points = [];
    for (const p of existing) {
      for (const c of this.children) {
        if (c.insert(p)) break;
      }
    }
  }
}
