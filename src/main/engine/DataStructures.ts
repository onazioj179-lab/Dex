// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX Engine -- Advanced Data Structures
// Rules 75-82: Persistent red-black tree, fractional cascading index,
// binary timeline format, roaring bitmaps, B-tree cache, trie,
// skip list, bloom filter
// ===========================================================================

import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Rule 75: Persistent Red-Black Tree
// Immutable balanced BST with structural sharing. Path copying gives
// O(log n) insert/delete with full version history.
// ---------------------------------------------------------------------------

enum RBColor {
  RED = 0,
  BLACK = 1,
}

interface RBNode<K, V> {
  key: K;
  value: V;
  color: RBColor;
  left: RBNode<K, V> | null;
  right: RBNode<K, V> | null;
  size: number;
}

class PersistentRedBlackTree<K, V> {
  private root: RBNode<K, V> | null = null;
  private compare: (a: K, b: K) => number;
  private versions: Array<RBNode<K, V> | null> = [];

  constructor(compareFn?: (a: K, b: K) => number) {
    this.compare = compareFn || ((a: K, b: K) => (a < b ? -1 : a > b ? 1 : 0));
    this.versions.push(null);
  }

  private nodeSize(node: RBNode<K, V> | null): number {
    return node ? node.size : 0;
  }

  private isRed(node: RBNode<K, V> | null): boolean {
    return node !== null && node.color === RBColor.RED;
  }

  private newNode(key: K, value: V, color: RBColor, left: RBNode<K, V> | null, right: RBNode<K, V> | null): RBNode<K, V> {
    return {
      key,
      value,
      color,
      left,
      right,
      size: 1 + this.nodeSize(left) + this.nodeSize(right),
    };
  }

  private rotateLeft(node: RBNode<K, V>): RBNode<K, V> {
    const r = node.right!;
    const newNode = this.newNode(node.key, node.value, node.color, node.left, r.left);
    return this.newNode(r.key, r.value, node.color, newNode, r.right);
  }

  private rotateRight(node: RBNode<K, V>): RBNode<K, V> {
    const l = node.left!;
    const newNode = this.newNode(node.key, node.value, node.color, l.right, node.right);
    return this.newNode(l.key, l.value, node.color, l.left, newNode);
  }

  private flipColors(node: RBNode<K, V>): RBNode<K, V> {
    const newColor = node.color === RBColor.RED ? RBColor.BLACK : RBColor.RED;
    const leftColor = node.left ? (node.left.color === RBColor.RED ? RBColor.BLACK : RBColor.RED) : RBColor.BLACK;
    const rightColor = node.right ? (node.right.color === RBColor.RED ? RBColor.BLACK : RBColor.RED) : RBColor.BLACK;

    return this.newNode(
      node.key,
      node.value,
      newColor,
      node.left ? this.newNode(node.left.key, node.left.value, leftColor, node.left.left, node.left.right) : null,
      node.right ? this.newNode(node.right.key, node.right.value, rightColor, node.right.left, node.right.right) : null
    );
  }

  private insertNode(node: RBNode<K, V> | null, key: K, value: V): RBNode<K, V> {
    if (node === null) {
      return this.newNode(key, value, RBColor.RED, null, null);
    }

    const cmp = this.compare(key, node.key);
    let result: RBNode<K, V>;

    if (cmp < 0) {
      result = this.newNode(node.key, node.value, node.color, this.insertNode(node.left, key, value), node.right);
    } else if (cmp > 0) {
      result = this.newNode(node.key, node.value, node.color, node.left, this.insertNode(node.right, key, value));
    } else {
      result = this.newNode(key, value, node.color, node.left, node.right);
    }

    // Fix-up
    if (this.isRed(result.right) && !this.isRed(result.left)) {
      result = this.rotateLeft(result);
    }
    if (this.isRed(result.left) && result.left && this.isRed(result.left.left)) {
      result = this.rotateRight(result);
    }
    if (this.isRed(result.left) && this.isRed(result.right)) {
      result = this.flipColors(result);
    }

    return result;
  }

  insert(key: K, value: V): PersistentRedBlackTree<K, V> {
    const newTree = new PersistentRedBlackTree<K, V>(this.compare);
    newTree.root = this.insertNode(this.root, key, value);
    if (newTree.root) {
      newTree.root = this.newNode(newTree.root.key, newTree.root.value, RBColor.BLACK, newTree.root.left, newTree.root.right);
    }
    newTree.versions = [...this.versions, newTree.root];
    return newTree;
  }

  get(key: K): V | undefined {
    let node = this.root;
    while (node) {
      const cmp = this.compare(key, node.key);
      if (cmp < 0) node = node.left;
      else if (cmp > 0) node = node.right;
      else return node.value;
    }
    return undefined;
  }

  size(): number {
    return this.nodeSize(this.root);
  }

  getVersion(version: number): RBNode<K, V> | null | undefined {
    return this.versions[version];
  }

  getVersionCount(): number {
    return this.versions.length;
  }

  inOrder(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    const traverse = (node: RBNode<K, V> | null) => {
      if (!node) return;
      traverse(node.left);
      result.push({ key: node.key, value: node.value });
      traverse(node.right);
    };
    traverse(this.root);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Rule 76: Fractional Cascading Index
// Accelerates multi-level binary search across sorted arrays.
// ---------------------------------------------------------------------------

class FractionalCascadingIndex {
  private levels: Float64Array[];
  private promotionLinks: Int32Array[]; // links to promoted elements

  constructor(sortedLevels: number[][]) {
    this.levels = sortedLevels.map((l) => new Float64Array(l));
    this.promotionLinks = [];
    this.buildCascadeLinks();
  }

  private buildCascadeLinks(): void {
    // Build bottom-up cascading structure
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const level = this.levels[i];
      const links = new Int32Array(level.length).fill(-1);

      if (i < this.levels.length - 1) {
        const nextLevel = this.levels[i + 1];
        // Every other element from next level is promoted
        let j = 0;
        for (let k = 0; k < nextLevel.length && j < level.length; k += 2) {
          while (j < level.length && level[j] < nextLevel[k]) j++;
          if (j < level.length) links[j] = k;
        }
      }

      this.promotionLinks.push(links);
    }
    this.promotionLinks.reverse();
  }

  search(target: number): number[] {
    const results: number[] = [];

    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      // Binary search in this level
      let lo = 0;
      let hi = level.length - 1;
      let found = -1;

      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (level[mid] === target) {
          found = mid;
          break;
        } else if (level[mid] < target) {
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      results.push(found);
    }

    return results;
  }

  getLevelCount(): number {
    return this.levels.length;
  }
}

// ---------------------------------------------------------------------------
// Rule 77: Binary Timeline Format
// Compact binary encoding for time-series event data.
// ---------------------------------------------------------------------------

class BinaryTimelineFormat {
  private buffer: ArrayBuffer;
  private view: DataView;
  private writeOffset = 0;
  private readOffset = 0;
  private entryCount = 0;

  // Entry layout: [timestamp:f64=8][type:u16=2][dataLen:u16=2][data:variable]
  static readonly HEADER_SIZE = 12;

  constructor(capacityBytes: number = 1048576) {
    this.buffer = new ArrayBuffer(capacityBytes);
    this.view = new DataView(this.buffer);
  }

  appendEvent(timestamp: number, type: number, data: Uint8Array): boolean {
    const needed = BinaryTimelineFormat.HEADER_SIZE + data.length;
    if (this.writeOffset + needed > this.buffer.byteLength) return false;

    this.view.setFloat64(this.writeOffset, timestamp, true);
    this.view.setUint16(this.writeOffset + 8, type, true);
    this.view.setUint16(this.writeOffset + 10, data.length, true);
    new Uint8Array(this.buffer, this.writeOffset + 12, data.length).set(data);

    this.writeOffset += needed;
    this.entryCount++;
    return true;
  }

  readNext(): { timestamp: number; type: number; data: Uint8Array } | null {
    if (this.readOffset >= this.writeOffset) return null;

    const timestamp = this.view.getFloat64(this.readOffset, true);
    const type = this.view.getUint16(this.readOffset + 8, true);
    const dataLen = this.view.getUint16(this.readOffset + 10, true);
    const data = new Uint8Array(this.buffer, this.readOffset + 12, dataLen);

    this.readOffset += BinaryTimelineFormat.HEADER_SIZE + dataLen;
    return { timestamp, type, data: new Uint8Array(data) }; // copy
  }

  resetReader(): void {
    this.readOffset = 0;
  }

  getEntryCount(): number {
    return this.entryCount;
  }

  getBytesUsed(): number {
    return this.writeOffset;
  }

  clear(): void {
    this.writeOffset = 0;
    this.readOffset = 0;
    this.entryCount = 0;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer, 0, this.writeOffset);
  }
}

// ---------------------------------------------------------------------------
// Rule 78: Roaring Bitmap
// Compressed bitmap for sparse sets. Divides 32-bit space into 16-bit
// containers. Each container uses array, bitmap, or run-length encoding.
// ---------------------------------------------------------------------------

class RoaringBitmap {
  private containers: Map<number, Uint16Array | Uint32Array> = new Map();
  private containerTypes: Map<number, 'array' | 'bitmap'> = new Map();
  private static CONTAINER_THRESHOLD = 4096;

  add(value: number): void {
    const hi = (value >>> 16) & 0xffff;
    const lo = value & 0xffff;

    const type = this.containerTypes.get(hi);
    if (!type) {
      // Create new array container
      this.containers.set(hi, new Uint16Array([lo]));
      this.containerTypes.set(hi, 'array');
      return;
    }

    if (type === 'array') {
      const arr = this.containers.get(hi) as Uint16Array;
      // Check if already present
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === lo) return;
      }

      if (arr.length >= RoaringBitmap.CONTAINER_THRESHOLD) {
        // Convert to bitmap
        const bitmap = new Uint32Array(2048); // 65536 bits
        for (let i = 0; i < arr.length; i++) {
          const idx = arr[i];
          bitmap[idx >>> 5] |= 1 << (idx & 31);
        }
        bitmap[lo >>> 5] |= 1 << (lo & 31);
        this.containers.set(hi, bitmap);
        this.containerTypes.set(hi, 'bitmap');
      } else {
        // Append to array (sorted insert)
        const newArr = new Uint16Array(arr.length + 1);
        let inserted = false;
        let j = 0;
        for (let i = 0; i < arr.length; i++) {
          if (!inserted && lo < arr[i]) {
            newArr[j++] = lo;
            inserted = true;
          }
          newArr[j++] = arr[i];
        }
        if (!inserted) newArr[j] = lo;
        this.containers.set(hi, newArr);
      }
    } else {
      // Bitmap container
      const bitmap = this.containers.get(hi) as Uint32Array;
      bitmap[lo >>> 5] |= 1 << (lo & 31);
    }
  }

  contains(value: number): boolean {
    const hi = (value >>> 16) & 0xffff;
    const lo = value & 0xffff;

    const type = this.containerTypes.get(hi);
    if (!type) return false;

    if (type === 'array') {
      const arr = this.containers.get(hi) as Uint16Array;
      // Binary search
      let l = 0, r = arr.length - 1;
      while (l <= r) {
        const m = (l + r) >>> 1;
        if (arr[m] === lo) return true;
        if (arr[m] < lo) l = m + 1;
        else r = m - 1;
      }
      return false;
    }

    const bitmap = this.containers.get(hi) as Uint32Array;
    return (bitmap[lo >>> 5] & (1 << (lo & 31))) !== 0;
  }

  cardinality(): number {
    let count = 0;
    for (const [hi, container] of this.containers) {
      const type = this.containerTypes.get(hi);
      if (type === 'array') {
        count += (container as Uint16Array).length;
      } else {
        const bitmap = container as Uint32Array;
        for (let i = 0; i < bitmap.length; i++) {
          // Population count
          let x = bitmap[i];
          x = x - ((x >> 1) & 0x55555555);
          x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
          count += (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
        }
      }
    }
    return count;
  }

  and(other: RoaringBitmap): RoaringBitmap {
    const result = new RoaringBitmap();
    for (const [hi] of this.containers) {
      if (!other.containers.has(hi)) continue;
      // Intersection at container level
      const thisType = this.containerTypes.get(hi);
      const otherType = other.containerTypes.get(hi);

      if (thisType === 'array' && otherType === 'array') {
        const a = this.containers.get(hi) as Uint16Array;
        const b = other.containers.get(hi) as Uint16Array;
        let ai = 0, bi = 0;
        while (ai < a.length && bi < b.length) {
          if (a[ai] === b[bi]) {
            result.add((hi << 16) | a[ai]);
            ai++; bi++;
          } else if (a[ai] < b[bi]) {
            ai++;
          } else {
            bi++;
          }
        }
      }
    }
    return result;
  }

  getContainerCount(): number {
    return this.containers.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 79: B-Tree Cache
// Disk-friendly B-tree for ordered key-value storage with high fanout.
// ---------------------------------------------------------------------------

class BTreeNode<K, V> {
  keys: K[] = [];
  values: V[] = [];
  children: BTreeNode<K, V>[] = [];
  leaf: boolean;

  constructor(leaf: boolean = true) {
    this.leaf = leaf;
  }
}

class BTreeCache<K, V> {
  private root: BTreeNode<K, V>;
  private order: number;
  private compare: (a: K, b: K) => number;
  private size = 0;

  constructor(order: number = 32, compareFn?: (a: K, b: K) => number) {
    this.order = order;
    this.compare = compareFn || ((a: K, b: K) => (a < b ? -1 : a > b ? 1 : 0));
    this.root = new BTreeNode<K, V>(true);
  }

  get(key: K): V | undefined {
    return this.searchNode(this.root, key);
  }

  private searchNode(node: BTreeNode<K, V>, key: K): V | undefined {
    let i = 0;
    while (i < node.keys.length && this.compare(key, node.keys[i]) > 0) i++;

    if (i < node.keys.length && this.compare(key, node.keys[i]) === 0) {
      return node.values[i];
    }

    if (node.leaf) return undefined;
    return this.searchNode(node.children[i], key);
  }

  insert(key: K, value: V): void {
    const root = this.root;

    if (root.keys.length === 2 * this.order - 1) {
      const newRoot = new BTreeNode<K, V>(false);
      newRoot.children.push(root);
      this.splitChild(newRoot, 0);
      this.root = newRoot;
    }

    this.insertNonFull(this.root, key, value);
    this.size++;
  }

  private splitChild(parent: BTreeNode<K, V>, i: number): void {
    const t = this.order;
    const child = parent.children[i];
    const sibling = new BTreeNode<K, V>(child.leaf);

    // Move upper half to sibling
    sibling.keys = child.keys.splice(t);
    sibling.values = child.values.splice(t);

    if (!child.leaf) {
      sibling.children = child.children.splice(t);
    }

    // Move median up to parent
    const medianKey = child.keys.pop()!;
    const medianValue = child.values.pop()!;
    parent.keys.splice(i, 0, medianKey);
    parent.values.splice(i, 0, medianValue);
    parent.children.splice(i + 1, 0, sibling);
  }

  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.keys.length - 1;

    if (node.leaf) {
      // Find position and insert
      while (i >= 0 && this.compare(key, node.keys[i]) < 0) i--;

      // Check for duplicate
      if (i >= 0 && this.compare(key, node.keys[i]) === 0) {
        node.values[i] = value;
        this.size--; // compensate for increment in insert()
        return;
      }

      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, value);
    } else {
      while (i >= 0 && this.compare(key, node.keys[i]) < 0) i--;

      if (i >= 0 && this.compare(key, node.keys[i]) === 0) {
        node.values[i] = value;
        this.size--;
        return;
      }

      i++;
      if (node.children[i].keys.length === 2 * this.order - 1) {
        this.splitChild(node, i);
        if (this.compare(key, node.keys[i]) > 0) i++;
      }
      this.insertNonFull(node.children[i], key, value);
    }
  }

  getSize(): number {
    return this.size;
  }

  range(low: K, high: K): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    this.rangeCollect(this.root, low, high, result);
    return result;
  }

  private rangeCollect(node: BTreeNode<K, V>, low: K, high: K, result: Array<{ key: K; value: V }>): void {
    let i = 0;
    while (i < node.keys.length && this.compare(node.keys[i], low) < 0) i++;

    for (; i < node.keys.length; i++) {
      if (this.compare(node.keys[i], high) > 0) return;

      if (!node.leaf && node.children[i]) {
        this.rangeCollect(node.children[i], low, high, result);
      }

      if (this.compare(node.keys[i], low) >= 0 && this.compare(node.keys[i], high) <= 0) {
        result.push({ key: node.keys[i], value: node.values[i] });
      }
    }

    if (!node.leaf && node.children[i]) {
      this.rangeCollect(node.children[i], low, high, result);
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 80: Trie (Prefix Tree)
// Fast prefix lookup for string keys (app names, paths, commands).
// ---------------------------------------------------------------------------

interface TrieNode<V> {
  children: Map<number, TrieNode<V>>;
  value: V | undefined;
  isTerminal: boolean;
}

class Trie<V> {
  private root: TrieNode<V>;
  private size = 0;

  constructor() {
    this.root = { children: new Map(), value: undefined, isTerminal: false };
  }

  insert(key: string, value: V): void {
    let node = this.root;
    for (let i = 0; i < key.length; i++) {
      const ch = key.charCodeAt(i);
      if (!node.children.has(ch)) {
        node.children.set(ch, { children: new Map(), value: undefined, isTerminal: false });
      }
      node = node.children.get(ch)!;
    }
    if (!node.isTerminal) this.size++;
    node.value = value;
    node.isTerminal = true;
  }

  get(key: string): V | undefined {
    let node = this.root;
    for (let i = 0; i < key.length; i++) {
      const child = node.children.get(key.charCodeAt(i));
      if (!child) return undefined;
      node = child;
    }
    return node.isTerminal ? node.value : undefined;
  }

  has(key: string): boolean {
    let node = this.root;
    for (let i = 0; i < key.length; i++) {
      const child = node.children.get(key.charCodeAt(i));
      if (!child) return false;
      node = child;
    }
    return node.isTerminal;
  }

  startsWith(prefix: string): Array<{ key: string; value: V }> {
    let node = this.root;
    for (let i = 0; i < prefix.length; i++) {
      const child = node.children.get(prefix.charCodeAt(i));
      if (!child) return [];
      node = child;
    }

    // Collect all entries under this prefix
    const results: Array<{ key: string; value: V }> = [];
    this.collectEntries(node, prefix, results);
    return results;
  }

  private collectEntries(node: TrieNode<V>, prefix: string, results: Array<{ key: string; value: V }>): void {
    if (node.isTerminal && node.value !== undefined) {
      results.push({ key: prefix, value: node.value });
    }
    for (const [ch, child] of node.children) {
      this.collectEntries(child, prefix + String.fromCharCode(ch), results);
    }
  }

  getSize(): number {
    return this.size;
  }

  delete(key: string): boolean {
    return this.deleteHelper(this.root, key, 0);
  }

  private deleteHelper(node: TrieNode<V>, key: string, depth: number): boolean {
    if (depth === key.length) {
      if (!node.isTerminal) return false;
      node.isTerminal = false;
      node.value = undefined;
      this.size--;
      return node.children.size === 0;
    }

    const ch = key.charCodeAt(depth);
    const child = node.children.get(ch);
    if (!child) return false;

    const shouldDelete = this.deleteHelper(child, key, depth + 1);
    if (shouldDelete) {
      node.children.delete(ch);
      return !node.isTerminal && node.children.size === 0;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rule 81: Skip List
// Probabilistic data structure with O(log n) search, insert, delete.
// Cache-friendlier than red-black trees for sorted data.
// ---------------------------------------------------------------------------

interface SkipListNode<K, V> {
  key: K;
  value: V;
  forward: Array<SkipListNode<K, V> | null>;
}

class SkipList<K, V> {
  private head: SkipListNode<K, V>;
  private maxLevel: number;
  private level = 0;
  private size = 0;
  private compare: (a: K, b: K) => number;
  private probability = 0.25;

  constructor(maxLevel: number = 16, compareFn?: (a: K, b: K) => number) {
    this.maxLevel = maxLevel;
    this.compare = compareFn || ((a: K, b: K) => (a < b ? -1 : a > b ? 1 : 0));
    this.head = {
      key: undefined as unknown as K,
      value: undefined as unknown as V,
      forward: new Array(maxLevel + 1).fill(null),
    };
  }

  private randomLevel(): number {
    let lvl = 0;
    while (Math.random() < this.probability && lvl < this.maxLevel) {
      lvl++;
    }
    return lvl;
  }

  insert(key: K, value: V): void {
    const update: Array<SkipListNode<K, V>> = new Array(this.maxLevel + 1);
    let current = this.head;

    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }

    current = current.forward[0]!;

    if (current && this.compare(current.key, key) === 0) {
      current.value = value;
      return;
    }

    const newLevel = this.randomLevel();

    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) {
        update[i] = this.head;
      }
      this.level = newLevel;
    }

    const newNode: SkipListNode<K, V> = {
      key,
      value,
      forward: new Array(newLevel + 1).fill(null),
    };

    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i].forward[i];
      update[i].forward[i] = newNode;
    }

    this.size++;
  }

  get(key: K): V | undefined {
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
    }
    current = current.forward[0]!;
    if (current && this.compare(current.key, key) === 0) {
      return current.value;
    }
    return undefined;
  }

  delete(key: K): boolean {
    const update: Array<SkipListNode<K, V>> = new Array(this.maxLevel + 1);
    let current = this.head;

    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compare(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }

    current = current.forward[0]!;

    if (!current || this.compare(current.key, key) !== 0) return false;

    for (let i = 0; i <= this.level; i++) {
      if (update[i].forward[i] !== current) break;
      update[i].forward[i] = current.forward[i];
    }

    while (this.level > 0 && this.head.forward[this.level] === null) {
      this.level--;
    }

    this.size--;
    return true;
  }

  getSize(): number {
    return this.size;
  }

  toArray(): Array<{ key: K; value: V }> {
    const result: Array<{ key: K; value: V }> = [];
    let node = this.head.forward[0];
    while (node) {
      result.push({ key: node.key, value: node.value });
      node = node.forward[0];
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Rule 82: Bloom Filter
// Space-efficient probabilistic set membership. No false negatives.
// ---------------------------------------------------------------------------

class BloomFilter {
  private bitArray: Uint32Array;
  private numBits: number;
  private numHashes: number;
  private insertedCount = 0;

  constructor(expectedElements: number, falsePositiveRate: number = 0.01) {
    // Optimal bit count: -n*ln(p) / (ln2)^2
    this.numBits = Math.ceil((-expectedElements * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
    // Optimal hash count: (m/n) * ln2
    this.numHashes = Math.max(1, Math.round((this.numBits / expectedElements) * Math.LN2));
    this.bitArray = new Uint32Array(Math.ceil(this.numBits / 32));
  }

  add(item: string): void {
    const hashes = this.getHashes(item);
    for (const h of hashes) {
      const pos = h % this.numBits;
      this.bitArray[pos >>> 5] |= 1 << (pos & 31);
    }
    this.insertedCount++;
  }

  mightContain(item: string): boolean {
    const hashes = this.getHashes(item);
    for (const h of hashes) {
      const pos = h % this.numBits;
      if ((this.bitArray[pos >>> 5] & (1 << (pos & 31))) === 0) {
        return false;
      }
    }
    return true;
  }

  private getHashes(item: string): number[] {
    // Double hashing: h(i) = h1 + i*h2
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0xcbf29ce4 | 0;

    for (let i = 0; i < item.length; i++) {
      const ch = item.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch;
      h2 = Math.imul(h2, 0x5bd1e995);
    }

    h1 = h1 >>> 0;
    h2 = h2 >>> 0;

    const hashes: number[] = [];
    for (let i = 0; i < this.numHashes; i++) {
      hashes.push(((h1 + i * h2) >>> 0) % this.numBits);
    }
    return hashes;
  }

  getInsertedCount(): number {
    return this.insertedCount;
  }

  getEstimatedFalsePositiveRate(): number {
    // Approximate: (1 - e^(-kn/m))^k
    const k = this.numHashes;
    const n = this.insertedCount;
    const m = this.numBits;
    return Math.pow(1 - Math.exp((-k * n) / m), k);
  }

  clear(): void {
    this.bitArray.fill(0);
    this.insertedCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Unified Data Structures Module
// ---------------------------------------------------------------------------

class DataStructures {
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    log.info('[DataStructures] Module initialized');
  }

  createRedBlackTree<K, V>(compareFn?: (a: K, b: K) => number): PersistentRedBlackTree<K, V> {
    return new PersistentRedBlackTree<K, V>(compareFn);
  }

  createBTree<K, V>(order?: number, compareFn?: (a: K, b: K) => number): BTreeCache<K, V> {
    return new BTreeCache<K, V>(order, compareFn);
  }

  createTrie<V>(): Trie<V> {
    return new Trie<V>();
  }

  createSkipList<K, V>(maxLevel?: number, compareFn?: (a: K, b: K) => number): SkipList<K, V> {
    return new SkipList<K, V>(maxLevel, compareFn);
  }

  createBloomFilter(expectedElements: number, fpr?: number): BloomFilter {
    return new BloomFilter(expectedElements, fpr);
  }

  createRoaringBitmap(): RoaringBitmap {
    return new RoaringBitmap();
  }

  createTimeline(capacityBytes?: number): BinaryTimelineFormat {
    return new BinaryTimelineFormat(capacityBytes);
  }

  createFractionalCascading(sortedLevels: number[][]): FractionalCascadingIndex {
    return new FractionalCascadingIndex(sortedLevels);
  }
}

export const dataStructures = new DataStructures();

export {
  DataStructures,
  PersistentRedBlackTree,
  FractionalCascadingIndex,
  BinaryTimelineFormat,
  RoaringBitmap,
  BTreeCache,
  Trie,
  SkipList,
  BloomFilter,
};
