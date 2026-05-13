// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export interface QuadPoint {
  x: number;
  y: number;
}

interface QuadNode {
  bounds: { x: number; y: number; w: number; h: number };
  point: QuadPoint | null;
  divided: boolean;
  nw?: QuadNode;
  ne?: QuadNode;
  sw?: QuadNode;
  se?: QuadNode;
}

function makeNode(x: number, y: number, w: number, h: number): QuadNode {
  return { bounds: { x, y, w, h }, point: null, divided: false };
}

function subdivide(node: QuadNode): void {
  const { x, y, w, h } = node.bounds;
  const hw = w / 2;
  const hh = h / 2;
  node.nw = makeNode(x, y, hw, hh);
  node.ne = makeNode(x + hw, y, hw, hh);
  node.sw = makeNode(x, y + hh, hw, hh);
  node.se = makeNode(x + hw, y + hh, hw, hh);
  node.divided = true;
}

function inBounds(b: QuadNode['bounds'], p: QuadPoint): boolean {
  return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
}

function insertNode(node: QuadNode, p: QuadPoint): boolean {
  if (!inBounds(node.bounds, p)) return false;
  if (!node.divided && node.point === null) {
    node.point = p;
    return true;
  }
  if (!node.divided) {
    const existing = node.point!;
    node.point = null;
    subdivide(node);
    insertNode(node.nw!, existing) ||
      insertNode(node.ne!, existing) ||
      insertNode(node.sw!, existing) ||
      insertNode(node.se!, existing);
  }
  return (
    insertNode(node.nw!, p) ||
    insertNode(node.ne!, p) ||
    insertNode(node.sw!, p) ||
    insertNode(node.se!, p)
  );
}

function queryNode(node: QuadNode, range: { x: number; y: number; w: number; h: number }, out: QuadPoint[]): void {
  const b = node.bounds;
  if (range.x + range.w <= b.x || range.x >= b.x + b.w) return;
  if (range.y + range.h <= b.y || range.y >= b.y + b.h) return;
  if (node.point && inBoundsRange(range, node.point)) out.push(node.point);
  if (node.divided) {
    queryNode(node.nw!, range, out);
    queryNode(node.ne!, range, out);
    queryNode(node.sw!, range, out);
    queryNode(node.se!, range, out);
  }
}

function inBoundsRange(b: { x: number; y: number; w: number; h: number }, p: QuadPoint): boolean {
  return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
}

export class PointQuadtree {
  private readonly root: QuadNode;

  constructor(x: number, y: number, w: number, h: number) {
    this.root = makeNode(x, y, w, h);
  }

  insert(p: QuadPoint): boolean {
    return insertNode(this.root, p);
  }

  query(range: { x: number; y: number; w: number; h: number }): QuadPoint[] {
    const out: QuadPoint[] = [];
    queryNode(this.root, range, out);
    return out;
  }
}
