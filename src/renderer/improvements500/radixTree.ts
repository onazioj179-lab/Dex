// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/*
 * DEX - Radix (compressed) trie keyed by strings (Wave 16).
 * Copyright (c) 2025 onazioj179-lab. Licensed under DEX terms.
 */

interface Node<V> {
  edge: string;
  children: Node<V>[];
  value: V | undefined;
  hasValue: boolean;
}

function makeNode<V>(edge: string): Node<V> {
  return { edge, children: [], value: undefined, hasValue: false };
}

function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

export class RadixTree<V> {
  private readonly root: Node<V> = makeNode<V>('');
  private size_ = 0;

  get size(): number {
    return this.size_;
  }

  set(key: string, value: V): void {
    let node = this.root;
    let rest = key;
    while (rest.length > 0) {
      let matched = false;
      for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i]!;
        const cp = commonPrefixLen(child.edge, rest);
        if (cp === 0) continue;
        if (cp === child.edge.length) {
          node = child;
          rest = rest.slice(cp);
          matched = true;
          break;
        }
        // Split child.
        const oldTail = makeNode<V>(child.edge.slice(cp));
        oldTail.children = child.children;
        oldTail.value = child.value;
        oldTail.hasValue = child.hasValue;
        child.edge = child.edge.slice(0, cp);
        child.children = [oldTail];
        child.value = undefined;
        child.hasValue = false;
        node = child;
        rest = rest.slice(cp);
        matched = true;
        break;
      }
      if (!matched) {
        const leaf = makeNode<V>(rest);
        leaf.value = value;
        leaf.hasValue = true;
        node.children.push(leaf);
        this.size_ += 1;
        return;
      }
    }
    if (!node.hasValue) this.size_ += 1;
    node.value = value;
    node.hasValue = true;
  }

  get(key: string): V | undefined {
    let node = this.root;
    let rest = key;
    while (rest.length > 0) {
      let next: Node<V> | undefined;
      for (const child of node.children) {
        if (rest.startsWith(child.edge)) {
          next = child;
          break;
        }
      }
      if (next === undefined) return undefined;
      rest = rest.slice(next.edge.length);
      node = next;
    }
    return node.hasValue ? node.value : undefined;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined || this.lookupExact(key);
  }

  private lookupExact(key: string): boolean {
    let node = this.root;
    let rest = key;
    while (rest.length > 0) {
      let next: Node<V> | undefined;
      for (const child of node.children) {
        if (rest.startsWith(child.edge)) {
          next = child;
          break;
        }
      }
      if (next === undefined) return false;
      rest = rest.slice(next.edge.length);
      node = next;
    }
    return node.hasValue;
  }

  /** Collect all keys with the given prefix. */
  keysWithPrefix(prefix: string): string[] {
    let node = this.root;
    let rest = prefix;
    let consumed = '';
    while (rest.length > 0) {
      let next: Node<V> | undefined;
      for (const child of node.children) {
        const cp = commonPrefixLen(child.edge, rest);
        if (cp === 0) continue;
        if (cp === rest.length) {
          // Prefix ends inside this edge.
          consumed += child.edge;
          const out: string[] = [];
          this.collect(child, consumed, out);
          return out;
        }
        if (cp === child.edge.length) {
          consumed += child.edge;
          rest = rest.slice(cp);
          next = child;
          break;
        }
        return [];
      }
      if (next === undefined) return [];
      node = next;
    }
    const out: string[] = [];
    this.collect(node, consumed, out);
    return out;
  }

  private collect(node: Node<V>, prefix: string, out: string[]): void {
    if (node.hasValue) out.push(prefix);
    for (const child of node.children) this.collect(child, prefix + child.edge, out);
  }
}
