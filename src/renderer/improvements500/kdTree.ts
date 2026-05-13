// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 2D k-d tree for nearest-neighbor and range queries on point clouds.
 */

export interface Point2 { x: number; y: number }

interface KdNode<P extends Point2> {
  point: P;
  axis: 0 | 1;
  left: KdNode<P> | null;
  right: KdNode<P> | null;
}

export class KdTree2<P extends Point2 = Point2> {
  private root: KdNode<P> | null = null;

  constructor(points: readonly P[] = []) {
    if (points.length > 0) this.root = this.build(points.slice(), 0);
  }

  private build(points: P[], depth: number): KdNode<P> | null {
    if (points.length === 0) return null;
    const axis: 0 | 1 = (depth % 2) as 0 | 1;
    points.sort((a, b) => (axis === 0 ? a.x - b.x : a.y - b.y));
    const mid = points.length >>> 1;
    return {
      point: points[mid]!,
      axis,
      left: this.build(points.slice(0, mid), depth + 1),
      right: this.build(points.slice(mid + 1), depth + 1),
    };
  }

  nearest(target: Point2): P | null {
    if (this.root === null) return null;
    const best = { node: this.root, distSq: distSq(this.root.point, target) };
    this.searchNearest(this.root, target, best);
    return best.node.point;
  }

  private searchNearest(node: KdNode<P>, target: Point2, best: { node: KdNode<P>; distSq: number }): void {
    const d = distSq(node.point, target);
    if (d < best.distSq) { best.node = node; best.distSq = d; }
    const axisDelta = node.axis === 0 ? target.x - node.point.x : target.y - node.point.y;
    const near = axisDelta < 0 ? node.left : node.right;
    const far = axisDelta < 0 ? node.right : node.left;
    if (near) this.searchNearest(near, target, best);
    if (far && axisDelta * axisDelta < best.distSq) this.searchNearest(far, target, best);
  }

  rangeQuery(minX: number, minY: number, maxX: number, maxY: number): P[] {
    const out: P[] = [];
    if (this.root) this.collectInRange(this.root, minX, minY, maxX, maxY, out);
    return out;
  }

  private collectInRange(
    node: KdNode<P>,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: P[],
  ): void {
    const p = node.point;
    if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) out.push(p);
    if (node.axis === 0) {
      if (node.left && p.x >= minX) this.collectInRange(node.left, minX, minY, maxX, maxY, out);
      if (node.right && p.x <= maxX) this.collectInRange(node.right, minX, minY, maxX, maxY, out);
    } else {
      if (node.left && p.y >= minY) this.collectInRange(node.left, minX, minY, maxX, maxY, out);
      if (node.right && p.y <= maxY) this.collectInRange(node.right, minX, minY, maxX, maxY, out);
    }
  }
}

function distSq(a: Point2, b: Point2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
