// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
interface Node<T> {
  value: T;
  children: Array<Node<T> | undefined>;
}

const FANOUT = 16;
const MASK = FANOUT - 1;

function depthFor(size: number): number {
  let d = 1;
  let cap = FANOUT;
  while (cap < size) {
    cap *= FANOUT;
    d++;
  }
  return d;
}

export class PersistentArray<T> {
  private readonly root: Node<T> | undefined;
  private readonly _size: number;
  private readonly _depth: number;
  private readonly _default: T;

  constructor(size: number, defaultValue: T, root?: Node<T>, depth?: number) {
    this._size = size;
    this._default = defaultValue;
    this._depth = depth ?? depthFor(Math.max(1, size));
    this.root = root;
  }

  get size(): number {
    return this._size;
  }

  get(index: number): T {
    if (index < 0 || index >= this._size) throw new RangeError('index');
    let node = this.root;
    for (let level = this._depth - 1; level >= 0 && node; level--) {
      const idx = (index >> (level * 4)) & MASK;
      node = node.children[idx];
    }
    return node ? node.value : this._default;
  }

  private setNode(node: Node<T> | undefined, level: number, index: number, value: T): Node<T> {
    if (level < 0) {
      return { value, children: [] };
    }
    const idx = (index >> (level * 4)) & MASK;
    const newChildren = node ? node.children.slice() : new Array(FANOUT);
    newChildren[idx] = this.setNode(node?.children[idx], level - 1, index, value);
    return { value: node?.value ?? this._default, children: newChildren };
  }

  set(index: number, value: T): PersistentArray<T> {
    if (index < 0 || index >= this._size) throw new RangeError('index');
    const newRoot = this.setNode(this.root, this._depth - 1, index, value);
    return new PersistentArray<T>(this._size, this._default, newRoot, this._depth);
  }
}
