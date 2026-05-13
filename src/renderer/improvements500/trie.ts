// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Trie (prefix tree) for fast prefix lookups, autocomplete, and dictionary
 * membership checks. Stores arbitrary string keys with optional values.
 */

interface TrieNode<V> {
  children: Map<string, TrieNode<V>>;
  hasValue: boolean;
  value?: V;
}

function createNode<V>(): TrieNode<V> {
  return { children: new Map(), hasValue: false };
}

export class Trie<V = true> {
  private readonly root: TrieNode<V> = createNode<V>();
  private _size = 0;

  get size(): number {
    return this._size;
  }

  insert(key: string, value: V = true as unknown as V): void {
    let node = this.root;
    for (let i = 0; i < key.length; i += 1) {
      const ch = key[i];
      let child = node.children.get(ch);
      if (!child) {
        child = createNode<V>();
        node.children.set(ch, child);
      }
      node = child;
    }
    if (!node.hasValue) this._size += 1;
    node.hasValue = true;
    node.value = value;
  }

  has(key: string): boolean {
    const node = this.findNode(key);
    return node !== null && node.hasValue;
  }

  get(key: string): V | undefined {
    const node = this.findNode(key);
    return node && node.hasValue ? node.value : undefined;
  }

  delete(key: string): boolean {
    const node = this.findNode(key);
    if (!node || !node.hasValue) return false;
    node.hasValue = false;
    node.value = undefined;
    this._size -= 1;
    return true;
  }

  /** All keys with the given prefix (lexicographic order). */
  prefixSearch(prefix: string, limit = Infinity): string[] {
    const node = this.findNode(prefix);
    if (!node) return [];
    const out: string[] = [];
    this.collect(node, prefix, out, limit);
    return out;
  }

  private findNode(key: string): TrieNode<V> | null {
    let node = this.root;
    for (let i = 0; i < key.length; i += 1) {
      const child = node.children.get(key[i]);
      if (!child) return null;
      node = child;
    }
    return node;
  }

  private collect(node: TrieNode<V>, path: string, out: string[], limit: number): void {
    if (out.length >= limit) return;
    if (node.hasValue) out.push(path);
    const sortedKeys = Array.from(node.children.keys()).sort();
    for (let i = 0; i < sortedKeys.length; i += 1) {
      if (out.length >= limit) return;
      const k = sortedKeys[i];
      const child = node.children.get(k)!;
      this.collect(child, path + k, out, limit);
    }
  }
}
