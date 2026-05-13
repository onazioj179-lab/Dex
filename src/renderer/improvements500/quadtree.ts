// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Point quadtree with axis-aligned rectangle range queries.
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export interface Qt2DPoint {
  x: number;
  y: number;
}

export interface QuadtreeBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export class Quadtree<P extends Qt2DPoint> {
  private bounds: QuadtreeBounds;
  private capacity: number;
  private points: P[] = [];
  private divided = false;
  private nw?: Quadtree<P>;
  private ne?: Quadtree<P>;
  private sw?: Quadtree<P>;
  private se?: Quadtree<P>;

  constructor(bounds: QuadtreeBounds, capacity = 8) {
    this.bounds = bounds;
    this.capacity = capacity;
  }

  insert(p: P): boolean {
    if (!this.contains(this.bounds, p)) return false;
    if (this.points.length < this.capacity && !this.divided) {
      this.points.push(p);
      return true;
    }
    if (!this.divided) this.subdivide();
    return (
      this.nw!.insert(p) || this.ne!.insert(p) || this.sw!.insert(p) || this.se!.insert(p)
    );
  }

  query(range: QuadtreeBounds, out: P[] = []): P[] {
    if (!this.intersects(range)) return out;
    for (const p of this.points) if (this.contains(range, p)) out.push(p);
    if (this.divided) {
      this.nw!.query(range, out);
      this.ne!.query(range, out);
      this.sw!.query(range, out);
      this.se!.query(range, out);
    }
    return out;
  }

  private contains(b: QuadtreeBounds, p: Qt2DPoint): boolean {
    return p.x >= b.xMin && p.x <= b.xMax && p.y >= b.yMin && p.y <= b.yMax;
  }

  private intersects(b: QuadtreeBounds): boolean {
    return !(
      b.xMin > this.bounds.xMax ||
      b.xMax < this.bounds.xMin ||
      b.yMin > this.bounds.yMax ||
      b.yMax < this.bounds.yMin
    );
  }

  private subdivide(): void {
    const { xMin, yMin, xMax, yMax } = this.bounds;
    const mx = (xMin + xMax) / 2;
    const my = (yMin + yMax) / 2;
    this.nw = new Quadtree({ xMin, yMin: my, xMax: mx, yMax }, this.capacity);
    this.ne = new Quadtree({ xMin: mx, yMin: my, xMax, yMax }, this.capacity);
    this.sw = new Quadtree({ xMin, yMin, xMax: mx, yMax: my }, this.capacity);
    this.se = new Quadtree({ xMin: mx, yMin, xMax, yMax: my }, this.capacity);
    this.divided = true;
    const existing = this.points;
    this.points = [];
    for (const p of existing) {
      this.nw.insert(p) || this.ne.insert(p) || this.sw.insert(p) || this.se.insert(p);
    }
  }
}
