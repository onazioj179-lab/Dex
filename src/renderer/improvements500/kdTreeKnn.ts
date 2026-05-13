// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// kd-tree for nearest-neighbour queries on points in arbitrary dimension.
export interface KdPoint {
  coords: ReadonlyArray<number>;
}

interface Node {
  point: KdPoint;
  axis: number;
  left: Node | null;
  right: Node | null;
}

export class KdTree<T extends KdPoint> {
  private readonly root: Node | null;
  private readonly k: number;

  constructor(points: ReadonlyArray<T>) {
    if (points.length === 0) {
      this.root = null;
      this.k = 0;
      return;
    }
    this.k = points[0].coords.length;
    this.root = this.build(points.slice(), 0);
  }

  private build(pts: KdPoint[], depth: number): Node | null {
    if (pts.length === 0) return null;
    const axis = depth % this.k;
    pts.sort((a, b) => a.coords[axis] - b.coords[axis]);
    const mid = pts.length >> 1;
    return {
      point: pts[mid],
      axis,
      left: this.build(pts.slice(0, mid), depth + 1),
      right: this.build(pts.slice(mid + 1), depth + 1),
    };
  }

  knn(target: ReadonlyArray<number>, k: number): T[] {
    const heap: { d: number; p: T }[] = [];
    const visit = (node: Node | null): void => {
      if (!node) return;
      let d = 0;
      for (let i = 0; i < this.k; i++) {
        const diff = node.point.coords[i] - target[i];
        d += diff * diff;
      }
      if (heap.length < k) {
        heap.push({ d, p: node.point as T });
        heap.sort((a, b) => b.d - a.d);
      } else if (d < heap[0].d) {
        heap[0] = { d, p: node.point as T };
        heap.sort((a, b) => b.d - a.d);
      }
      const diff = target[node.axis] - node.point.coords[node.axis];
      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;
      visit(near);
      if (heap.length < k || diff * diff < heap[0].d) visit(far);
    };
    visit(this.root);
    return heap.sort((a, b) => a.d - b.d).map((e) => e.p);
  }
}
