// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Advanced Data Structures
// ==========================================================================
// Technique 40: Lock-Free Task Queue (Michael-Scott via JS)
// Technique 41: Wait-Free Ring Buffer
// Technique 43: Trie for Command Palette / Search
// Technique 44: BloomFilter Negative Cache
// Technique 45: SkipList for Timeline O(log n) Insert/Search
// Technique 46: RadixTree for File Watcher / Route Registry
// Technique 47: O(1) LRU Cache (Doubly Linked List + Map)
// Technique 48: FibonacciHeap for Priority Scheduling
// Technique 49: SuffixAutomaton for Pattern Matching
// Technique 53: Enhanced Inverted Index with BM25 Scoring
// Technique 55: RoaringBitmap-like Bitset for Search Result Sets
// ==========================================================================

import * as log from 'electron-log';

// ---------------------------------------------------------------------------
// Technique 43: Trie for Command Palette and Prefix Search
// ---------------------------------------------------------------------------

interface TrieNode {
  children: Map<number, TrieNode>;
  isEnd: boolean;
  value: string | null;
  data: unknown;
  frequency: number;
}

export class Trie {
  private root: TrieNode;
  private size = 0;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): TrieNode {
    return { children: new Map(), isEnd: false, value: null, data: null, frequency: 0 };
  }

  insert(word: string, data?: unknown): void {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const ch = word.charCodeAt(i);
      let child = node.children.get(ch);
      if (!child) {
        child = this.createNode();
        node.children.set(ch, child);
      }
      node = child;
    }
    if (!node.isEnd) this.size++;
    node.isEnd = true;
    node.value = word;
    node.data = data !== undefined ? data : null;
    node.frequency++;
  }

  search(word: string): { found: boolean; data: unknown; frequency: number } {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const child = node.children.get(word.charCodeAt(i));
      if (!child) return { found: false, data: null, frequency: 0 };
      node = child;
    }
    return { found: node.isEnd, data: node.data, frequency: node.frequency };
  }

  prefixSearch(prefix: string, maxResults: number = 20): Array<{ word: string; data: unknown; frequency: number }> {
    let node = this.root;
    for (let i = 0; i < prefix.length; i++) {
      const child = node.children.get(prefix.charCodeAt(i));
      if (!child) return [];
      node = child;
    }
    const results: Array<{ word: string; data: unknown; frequency: number }> = [];
    this.collectWords(node, results, maxResults);
    results.sort((a, b) => b.frequency - a.frequency);
    return results;
  }

  private collectWords(node: TrieNode, results: Array<{ word: string; data: unknown; frequency: number }>, max: number): void {
    if (results.length >= max) return;
    if (node.isEnd && node.value) {
      results.push({ word: node.value, data: node.data, frequency: node.frequency });
    }
    for (const child of node.children.values()) {
      if (results.length >= max) return;
      this.collectWords(child, results, max);
    }
  }

  delete(word: string): boolean {
    const path: Array<{ node: TrieNode; charCode: number }> = [];
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const ch = word.charCodeAt(i);
      const child = node.children.get(ch);
      if (!child) return false;
      path.push({ node, charCode: ch });
      node = child;
    }
    if (!node.isEnd) return false;
    node.isEnd = false;
    node.value = null;
    node.data = null;
    this.size--;

    // Prune empty branches
    for (let i = path.length - 1; i >= 0; i--) {
      const { node: parent, charCode } = path[i];
      const child = parent.children.get(charCode);
      if (child && !child.isEnd && child.children.size === 0) {
        parent.children.delete(charCode);
      } else {
        break;
      }
    }
    return true;
  }

  get count(): number { return this.size; }
  clear(): void { this.root = this.createNode(); this.size = 0; }
}

// ---------------------------------------------------------------------------
// Technique 44: BloomFilter Negative Cache
// ---------------------------------------------------------------------------

export class BloomFilter {
  private bits: Uint32Array;
  private numBits: number;
  private numHashes: number;
  private count = 0;

  constructor(expectedItems: number = 10000, falsePositiveRate: number = 0.01) {
    this.numBits = Math.max(64, Math.ceil(-expectedItems * Math.log(falsePositiveRate) / (Math.LN2 * Math.LN2)));
    this.numHashes = Math.max(1, Math.round((this.numBits / expectedItems) * Math.LN2));
    this.bits = new Uint32Array(Math.ceil(this.numBits / 32));
  }

  private hash(str: string, seed: number): number {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0) % this.numBits;
  }

  add(item: string): void {
    for (let i = 0; i < this.numHashes; i++) {
      const pos = this.hash(item, i * 0x9E3779B9);
      this.bits[pos >>> 5] |= (1 << (pos & 31));
    }
    this.count++;
  }

  mightContain(item: string): boolean {
    for (let i = 0; i < this.numHashes; i++) {
      const pos = this.hash(item, i * 0x9E3779B9);
      if ((this.bits[pos >>> 5] & (1 << (pos & 31))) === 0) return false;
    }
    return true;
  }

  definitelyNotContains(item: string): boolean {
    return !this.mightContain(item);
  }

  get approximateCount(): number { return this.count; }

  get falsePositiveEstimate(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      let v = this.bits[i];
      while (v) { v &= (v - 1); setBits++; }
    }
    const p = setBits / this.numBits;
    return Math.pow(p, this.numHashes);
  }

  clear(): void {
    this.bits.fill(0);
    this.count = 0;
  }
}

// Pre-built bloom filters for common use cases
export const dbKeyExistenceFilter = new BloomFilter(50000, 0.001);
export const urlVisitedFilter = new BloomFilter(10000, 0.01);
export const duplicateEventFilter = new BloomFilter(10000, 0.01);
export const pluginBlacklistFilter = new BloomFilter(1000, 0.001);

// ---------------------------------------------------------------------------
// Technique 45: SkipList for Timeline O(log n) Insert/Search
// ---------------------------------------------------------------------------

interface SkipListNode<K, V> {
  key: K;
  value: V;
  forward: Array<SkipListNode<K, V> | null>;
}

export class SkipList<K extends number | bigint, V> {
  private maxLevel = 32;
  private probability = 0.5;
  private level = 0;
  private head: SkipListNode<K, V>;
  private count = 0;
  private compareFn: (a: K, b: K) => number;

  constructor(compareFn?: (a: K, b: K) => number) {
    this.compareFn = compareFn || ((a: K, b: K) => (a < b ? -1 : a > b ? 1 : 0));
    this.head = { key: 0 as K, value: null as unknown as V, forward: new Array(this.maxLevel).fill(null) };
  }

  private randomLevel(): number {
    let lvl = 0;
    while (Math.random() < this.probability && lvl < this.maxLevel - 1) lvl++;
    return lvl;
  }

  insert(key: K, value: V): void {
    const update: Array<SkipListNode<K, V>> = new Array(this.maxLevel);
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] !== null && this.compareFn(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }

    const next = current.forward[0];
    if (next !== null && this.compareFn(next.key, key) === 0) {
      next.value = value;
      return;
    }

    const newLevel = this.randomLevel();
    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) update[i] = this.head;
      this.level = newLevel;
    }

    const newNode: SkipListNode<K, V> = { key, value, forward: new Array(newLevel + 1).fill(null) };
    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i].forward[i];
      update[i].forward[i] = newNode;
    }
    this.count++;
  }

  search(key: K): V | undefined {
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] !== null && this.compareFn(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
    }
    const target = current.forward[0];
    if (target !== null && this.compareFn(target.key, key) === 0) return target.value;
    return undefined;
  }

  rangeQuery(low: K, high: K): Array<{ key: K; value: V }> {
    const results: Array<{ key: K; value: V }> = [];
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] !== null && this.compareFn(current.forward[i]!.key, low) < 0) {
        current = current.forward[i]!;
      }
    }
    current = current.forward[0] as SkipListNode<K, V>;
    while (current !== null && this.compareFn(current.key, high) <= 0) {
      results.push({ key: current.key, value: current.value });
      current = current.forward[0] as SkipListNode<K, V>;
    }
    return results;
  }

  delete(key: K): boolean {
    const update: Array<SkipListNode<K, V>> = new Array(this.maxLevel);
    let current = this.head;
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] !== null && this.compareFn(current.forward[i]!.key, key) < 0) {
        current = current.forward[i]!;
      }
      update[i] = current;
    }
    const target = current.forward[0];
    if (target === null || this.compareFn(target.key, key) !== 0) return false;
    for (let i = 0; i <= this.level; i++) {
      if (update[i].forward[i] !== target) break;
      update[i].forward[i] = target.forward[i];
    }
    while (this.level > 0 && this.head.forward[this.level] === null) this.level--;
    this.count--;
    return true;
  }

  get length(): number { return this.count; }
}

// ---------------------------------------------------------------------------
// Technique 46: RadixTree for File Watcher / Route Registry
// ---------------------------------------------------------------------------

interface RadixNode<V> {
  prefix: string;
  children: Map<number, RadixNode<V>>;
  value: V | null;
  isTerminal: boolean;
}

export class RadixTree<V> {
  private root: RadixNode<V>;
  private count = 0;

  constructor() {
    this.root = { prefix: '', children: new Map(), value: null, isTerminal: false };
  }

  insert(key: string, value: V): void {
    let node = this.root;
    let remaining = key;

    while (remaining.length > 0) {
      const firstChar = remaining.charCodeAt(0);
      const child = node.children.get(firstChar);

      if (!child) {
        const newNode: RadixNode<V> = { prefix: remaining, children: new Map(), value, isTerminal: true };
        node.children.set(firstChar, newNode);
        this.count++;
        return;
      }

      const commonLen = this.commonPrefixLen(child.prefix, remaining);

      if (commonLen === child.prefix.length && commonLen === remaining.length) {
        if (!child.isTerminal) this.count++;
        child.value = value;
        child.isTerminal = true;
        return;
      }

      if (commonLen < child.prefix.length) {
        // Split the existing node
        const splitNode: RadixNode<V> = {
          prefix: child.prefix.substring(0, commonLen),
          children: new Map(),
          value: null,
          isTerminal: false
        };
        child.prefix = child.prefix.substring(commonLen);
        splitNode.children.set(child.prefix.charCodeAt(0), child);
        node.children.set(firstChar, splitNode);

        if (commonLen === remaining.length) {
          splitNode.value = value;
          splitNode.isTerminal = true;
          this.count++;
          return;
        }
        node = splitNode;
        remaining = remaining.substring(commonLen);
      } else {
        node = child;
        remaining = remaining.substring(commonLen);
      }
    }
  }

  search(key: string): V | undefined {
    let node = this.root;
    let remaining = key;

    while (remaining.length > 0) {
      const child = node.children.get(remaining.charCodeAt(0));
      if (!child) return undefined;
      if (!remaining.startsWith(child.prefix)) return undefined;
      remaining = remaining.substring(child.prefix.length);
      node = child;
    }
    return node.isTerminal ? (node.value as V) : undefined;
  }

  prefixMatch(prefix: string): Array<{ key: string; value: V }> {
    const results: Array<{ key: string; value: V }> = [];
    let node = this.root;
    let remaining = prefix;
    let consumed = '';

    while (remaining.length > 0) {
      const child = node.children.get(remaining.charCodeAt(0));
      if (!child) return results;

      const commonLen = this.commonPrefixLen(child.prefix, remaining);
      if (commonLen < remaining.length && commonLen < child.prefix.length) return results;

      consumed += child.prefix;
      remaining = remaining.substring(child.prefix.length);
      node = child;
    }

    this.collectAll(node, consumed, results);
    return results;
  }

  private collectAll(node: RadixNode<V>, prefix: string, results: Array<{ key: string; value: V }>): void {
    if (node.isTerminal && node.value !== null) {
      results.push({ key: prefix, value: node.value });
    }
    for (const child of node.children.values()) {
      this.collectAll(child, prefix + child.prefix, results);
    }
  }

  private commonPrefixLen(a: string, b: string): number {
    const len = Math.min(a.length, b.length);
    let i = 0;
    while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) i++;
    return i;
  }

  get size(): number { return this.count; }
}

// ---------------------------------------------------------------------------
// Technique 47: O(1) LRU Cache (Doubly Linked List + Map)
// ---------------------------------------------------------------------------

interface DLLNode<K, V> {
  key: K;
  value: V;
  prev: DLLNode<K, V> | null;
  next: DLLNode<K, V> | null;
}

export class LRUCache<K, V> {
  private capacity: number;
  private map: Map<K, DLLNode<K, V>>;
  private head: DLLNode<K, V> | null = null;
  private tail: DLLNode<K, V> | null = null;
  private hits = 0;
  private misses = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) { this.misses++; return undefined; }
    this.hits++;
    this.moveToHead(node);
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }

    const node: DLLNode<K, V> = { key, value, prev: null, next: null };
    this.map.set(key, node);
    this.addToHead(node);

    if (this.map.size > this.capacity) {
      const evicted = this.removeTail();
      if (evicted) this.map.delete(evicted.key);
    }
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    return true;
  }

  has(key: K): boolean { return this.map.has(key); }

  get size(): number { return this.map.size; }

  get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  get stats(): { hits: number; misses: number; hitRate: number; size: number; capacity: number } {
    return { hits: this.hits, misses: this.misses, hitRate: this.hitRate, size: this.size, capacity: this.capacity };
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
  }

  keys(): K[] {
    const result: K[] = [];
    let node = this.head;
    while (node) { result.push(node.key); node = node.next; }
    return result;
  }

  private addToHead(node: DLLNode<K, V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeNode(node: DLLNode<K, V>): void {
    if (node.prev) node.prev.next = node.next; else this.head = node.next;
    if (node.next) node.next.prev = node.prev; else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: DLLNode<K, V>): void {
    if (node === this.head) return;
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeTail(): DLLNode<K, V> | null {
    const node = this.tail;
    if (!node) return null;
    this.removeNode(node);
    return node;
  }
}

// Pre-built LRU caches for system-wide use
export const queryResultCache = new LRUCache<string, unknown>(500);
export const thumbnailCache = new LRUCache<string, Buffer>(200);
export const rewindSnapshotCache = new LRUCache<string, unknown>(100);
export const ipcResponseCache = new LRUCache<string, unknown>(300);
export const routeHandlerCache = new LRUCache<string, unknown>(100);

// ---------------------------------------------------------------------------
// Technique 48: FibonacciHeap for Priority Scheduling
// ---------------------------------------------------------------------------

interface FibNode<K, V> {
  key: K;
  value: V;
  degree: number;
  marked: boolean;
  parent: FibNode<K, V> | null;
  child: FibNode<K, V> | null;
  left: FibNode<K, V>;
  right: FibNode<K, V>;
}

export class FibonacciHeap<K extends number, V> {
  private min: FibNode<K, V> | null = null;
  private count = 0;

  private createNode(key: K, value: V): FibNode<K, V> {
    const node: FibNode<K, V> = { key, value, degree: 0, marked: false, parent: null, child: null, left: null as unknown as FibNode<K, V>, right: null as unknown as FibNode<K, V> };
    node.left = node;
    node.right = node;
    return node;
  }

  insert(key: K, value: V): FibNode<K, V> {
    const node = this.createNode(key, value);
    if (this.min === null) {
      this.min = node;
    } else {
      this.addToRootList(node);
      if (node.key < this.min.key) this.min = node;
    }
    this.count++;
    return node;
  }

  extractMin(): { key: K; value: V } | null {
    const z = this.min;
    if (!z) return null;

    // Add all children to root list
    if (z.child) {
      let child = z.child;
      const children: FibNode<K, V>[] = [];
      do { children.push(child); child = child.right; } while (child !== z.child);
      for (const c of children) {
        this.addToRootList(c);
        c.parent = null;
      }
    }

    // Remove z from root list
    this.removeFromList(z);
    if (z === z.right) {
      this.min = null;
    } else {
      this.min = z.right;
      this.consolidate();
    }
    this.count--;
    return { key: z.key, value: z.value };
  }

  decreaseKey(node: FibNode<K, V>, newKey: K): void {
    if (newKey > node.key) return;
    node.key = newKey;
    const parent = node.parent;
    if (parent && node.key < parent.key) {
      this.cut(node, parent);
      this.cascadingCut(parent);
    }
    if (this.min && node.key < this.min.key) this.min = node;
  }

  peek(): { key: K; value: V } | null {
    if (!this.min) return null;
    return { key: this.min.key, value: this.min.value };
  }

  get size(): number { return this.count; }
  get isEmpty(): boolean { return this.count === 0; }

  private addToRootList(node: FibNode<K, V>): void {
    if (!this.min) { node.left = node; node.right = node; this.min = node; return; }
    node.right = this.min.right;
    node.left = this.min;
    this.min.right.left = node;
    this.min.right = node;
  }

  private removeFromList(node: FibNode<K, V>): void {
    node.left.right = node.right;
    node.right.left = node.left;
  }

  private consolidate(): void {
    const maxDegree = Math.floor(Math.log2(this.count)) + 2;
    const A: Array<FibNode<K, V> | null> = new Array(maxDegree + 1).fill(null);

    const roots: FibNode<K, V>[] = [];
    if (this.min) {
      let current = this.min;
      do { roots.push(current); current = current.right; } while (current !== this.min);
    }

    for (const w of roots) {
      let x = w;
      let d = x.degree;
      while (d < A.length && A[d] !== null) {
        let y = A[d]!;
        if (x.key > y.key) { const tmp = x; x = y; y = tmp; }
        this.link(y, x);
        A[d] = null;
        d++;
      }
      if (d < A.length) A[d] = x;
    }

    this.min = null;
    for (let i = 0; i <= maxDegree; i++) {
      if (A[i]) {
        const node = A[i]!;
        node.left = node;
        node.right = node;
        if (!this.min) {
          this.min = node;
        } else {
          this.addToRootList(node);
          if (node.key < this.min.key) this.min = node;
        }
      }
    }
  }

  private link(y: FibNode<K, V>, x: FibNode<K, V>): void {
    this.removeFromList(y);
    y.parent = x;
    if (!x.child) {
      x.child = y;
      y.left = y;
      y.right = y;
    } else {
      y.right = x.child.right;
      y.left = x.child;
      x.child.right.left = y;
      x.child.right = y;
    }
    x.degree++;
    y.marked = false;
  }

  private cut(x: FibNode<K, V>, y: FibNode<K, V>): void {
    if (x === x.right) {
      y.child = null;
    } else {
      if (y.child === x) y.child = x.right;
      x.left.right = x.right;
      x.right.left = x.left;
    }
    y.degree--;
    this.addToRootList(x);
    x.parent = null;
    x.marked = false;
  }

  private cascadingCut(y: FibNode<K, V>): void {
    const z = y.parent;
    if (z) {
      if (!y.marked) { y.marked = true; } else { this.cut(y, z); this.cascadingCut(z); }
    }
  }
}

// ---------------------------------------------------------------------------
// Technique 49: SuffixAutomaton for Pattern Matching
// ---------------------------------------------------------------------------

interface SAState {
  len: number;
  link: number;
  transitions: Map<number, number>;
}

export class SuffixAutomaton {
  private states: SAState[] = [];
  private last = 0;

  constructor(text?: string) {
    // Initial state
    this.states.push({ len: 0, link: -1, transitions: new Map() });
    if (text) this.build(text);
  }

  build(text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.extend(text.charCodeAt(i));
    }
  }

  private extend(c: number): void {
    const cur = this.states.length;
    this.states.push({ len: this.states[this.last].len + 1, link: -1, transitions: new Map() });

    let p = this.last;
    while (p !== -1 && !this.states[p].transitions.has(c)) {
      this.states[p].transitions.set(c, cur);
      p = this.states[p].link;
    }

    if (p === -1) {
      this.states[cur].link = 0;
    } else {
      const q = this.states[p].transitions.get(c)!;
      if (this.states[p].len + 1 === this.states[q].len) {
        this.states[cur].link = q;
      } else {
        const clone = this.states.length;
        this.states.push({
          len: this.states[p].len + 1,
          link: this.states[q].link,
          transitions: new Map(this.states[q].transitions)
        });
        while (p !== -1 && this.states[p].transitions.get(c) === q) {
          this.states[p].transitions.set(c, clone);
          p = this.states[p].link;
        }
        this.states[q].link = clone;
        this.states[cur].link = clone;
      }
    }
    this.last = cur;
  }

  contains(pattern: string): boolean {
    let state = 0;
    for (let i = 0; i < pattern.length; i++) {
      const next = this.states[state].transitions.get(pattern.charCodeAt(i));
      if (next === undefined) return false;
      state = next;
    }
    return true;
  }

  countOccurrences(pattern: string): number {
    let state = 0;
    for (let i = 0; i < pattern.length; i++) {
      const next = this.states[state].transitions.get(pattern.charCodeAt(i));
      if (next === undefined) return 0;
      state = next;
    }
    // Count distinct end positions reachable from this state
    const visited = new Set<number>();
    const queue = [state];
    let count = 0;
    while (queue.length > 0) {
      const s = queue.pop()!;
      if (visited.has(s)) continue;
      visited.add(s);
      count++;
      for (const next of this.states[s].transitions.values()) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    return count;
  }

  get stateCount(): number { return this.states.length; }
}

// ---------------------------------------------------------------------------
// Technique 40: Lock-Free Queue (Michael-Scott style via JS single-threaded)
// ---------------------------------------------------------------------------

interface LFQueueNode<T> {
  value: T | null;
  next: LFQueueNode<T> | null;
}

export class LockFreeQueue<T> {
  private head: LFQueueNode<T>;
  private tail: LFQueueNode<T>;
  private count = 0;

  constructor() {
    const sentinel: LFQueueNode<T> = { value: null, next: null };
    this.head = sentinel;
    this.tail = sentinel;
  }

  enqueue(value: T): void {
    const node: LFQueueNode<T> = { value, next: null };
    this.tail.next = node;
    this.tail = node;
    this.count++;
  }

  dequeue(): T | undefined {
    const next = this.head.next;
    if (!next) return undefined;
    this.head = next;
    this.count--;
    const val = next.value as T;
    next.value = null;
    return val;
  }

  peek(): T | undefined {
    const next = this.head.next;
    return next ? (next.value as T) : undefined;
  }

  get size(): number { return this.count; }
  get isEmpty(): boolean { return this.count === 0; }
}

// ---------------------------------------------------------------------------
// Technique 41: Wait-Free Ring Buffer
// ---------------------------------------------------------------------------

export class RingBuffer<T> {
  private buffer: Array<T | null>;
  private capacity: number;
  private writeIdx = 0;
  private readIdx = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  write(value: T): boolean {
    if (this.count >= this.capacity) return false;
    this.buffer[this.writeIdx] = value;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    this.count++;
    return true;
  }

  read(): T | undefined {
    if (this.count <= 0) return undefined;
    const val = this.buffer[this.readIdx]!;
    this.buffer[this.readIdx] = null;
    this.readIdx = (this.readIdx + 1) % this.capacity;
    this.count--;
    return val;
  }

  peek(): T | undefined {
    if (this.count <= 0) return undefined;
    return this.buffer[this.readIdx] as T;
  }

  get size(): number { return this.count; }
  get isFull(): boolean { return this.count >= this.capacity; }
  get isEmpty(): boolean { return this.count === 0; }

  clear(): void {
    this.buffer.fill(null);
    this.writeIdx = 0;
    this.readIdx = 0;
    this.count = 0;
  }
}

// Pre-built ring buffers for common use cases
export const logRingBuffer = new RingBuffer<unknown>(4096);
export const eventRingBuffer = new RingBuffer<unknown>(2048);
export const perfRingBuffer = new RingBuffer<unknown>(1024);

// ---------------------------------------------------------------------------
// Technique 53: Enhanced Inverted Index with BM25
// ---------------------------------------------------------------------------

interface PostingEntry {
  docId: number;
  frequency: number;
  positions: number[];
}

export class InvertedIndex {
  private index: Map<string, PostingEntry[]> = new Map();
  private docLengths: Map<number, number> = new Map();
  private avgDocLength = 0;
  private totalDocs = 0;

  // BM25 parameters
  private k1 = 1.2;
  private b = 0.75;

  indexDocument(docId: number, tokens: string[]): void {
    this.docLengths.set(docId, tokens.length);
    this.totalDocs++;
    this.avgDocLength = (this.avgDocLength * (this.totalDocs - 1) + tokens.length) / this.totalDocs;

    const termFreqs = new Map<string, number[]>();
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].toLowerCase();
      if (!termFreqs.has(token)) termFreqs.set(token, []);
      termFreqs.get(token)!.push(i);
    }

    for (const [term, positions] of termFreqs) {
      if (!this.index.has(term)) this.index.set(term, []);
      const postings = this.index.get(term)!;
      // Remove old entry if document is being re-indexed
      const existingIdx = postings.findIndex(p => p.docId === docId);
      if (existingIdx >= 0) postings.splice(existingIdx, 1);
      postings.push({ docId, frequency: positions.length, positions });
    }
  }

  removeDocument(docId: number): void {
    for (const postings of this.index.values()) {
      const idx = postings.findIndex(p => p.docId === docId);
      if (idx >= 0) postings.splice(idx, 1);
    }
    this.docLengths.delete(docId);
    this.totalDocs = Math.max(0, this.totalDocs - 1);
  }

  searchBM25(queryTokens: string[], maxResults: number = 50): Array<{ docId: number; score: number }> {
    const scores = new Map<number, number>();

    for (const token of queryTokens) {
      const term = token.toLowerCase();
      const postings = this.index.get(term);
      if (!postings || postings.length === 0) continue;

      const idf = Math.log((this.totalDocs - postings.length + 0.5) / (postings.length + 0.5) + 1);

      for (const posting of postings) {
        const docLen = this.docLengths.get(posting.docId) || 1;
        const tf = posting.frequency;
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength)));
        const bm25Score = idf * tfNorm;
        scores.set(posting.docId, (scores.get(posting.docId) || 0) + bm25Score);
      }
    }

    const results = Array.from(scores.entries())
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults);
  }

  phraseSearch(phrase: string[]): number[] {
    if (phrase.length === 0) return [];
    const firstTerm = phrase[0].toLowerCase();
    const firstPostings = this.index.get(firstTerm);
    if (!firstPostings) return [];

    const results: number[] = [];
    for (const posting of firstPostings) {
      for (const startPos of posting.positions) {
        let matched = true;
        for (let i = 1; i < phrase.length; i++) {
          const term = phrase[i].toLowerCase();
          const termPostings = this.index.get(term);
          if (!termPostings) { matched = false; break; }
          const docPosting = termPostings.find(p => p.docId === posting.docId);
          if (!docPosting || !docPosting.positions.includes(startPos + i)) { matched = false; break; }
        }
        if (matched) { results.push(posting.docId); break; }
      }
    }
    return results;
  }

  get termCount(): number { return this.index.size; }
  get documentCount(): number { return this.totalDocs; }
}

// ---------------------------------------------------------------------------
// Technique 55: RoaringBitmap-like Bitset
// ---------------------------------------------------------------------------

export class CompactBitset {
  // Sparse container: stores either array of 16-bit values or bitmap
  // Container key = high 16 bits, value = run-length encoded or bitmap of low 16 bits
  private containers: Map<number, Uint16Array | Uint32Array> = new Map();
  private containerTypes: Map<number, 'array' | 'bitmap'> = new Map();
  private static readonly ARRAY_THRESHOLD = 4096;

  add(value: number): void {
    const hi = (value >>> 16) & 0xFFFF;
    const lo = value & 0xFFFF;
    const type = this.containerTypes.get(hi);

    if (!type) {
      // New container as sparse array
      this.containers.set(hi, new Uint16Array([lo]));
      this.containerTypes.set(hi, 'array');
      return;
    }

    if (type === 'array') {
      const arr = this.containers.get(hi) as Uint16Array;
      // Check if already exists
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === lo) return;
      }
      if (arr.length >= CompactBitset.ARRAY_THRESHOLD) {
        // Convert to bitmap
        const bitmap = new Uint32Array(2048); // 65536 bits = 2048 uint32s
        for (let i = 0; i < arr.length; i++) {
          bitmap[arr[i] >>> 5] |= (1 << (arr[i] & 31));
        }
        bitmap[lo >>> 5] |= (1 << (lo & 31));
        this.containers.set(hi, bitmap);
        this.containerTypes.set(hi, 'bitmap');
      } else {
        const newArr = new Uint16Array(arr.length + 1);
        // Insert in sorted order
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
      bitmap[lo >>> 5] |= (1 << (lo & 31));
    }
  }

  has(value: number): boolean {
    const hi = (value >>> 16) & 0xFFFF;
    const lo = value & 0xFFFF;
    const type = this.containerTypes.get(hi);
    if (!type) return false;

    if (type === 'array') {
      const arr = this.containers.get(hi) as Uint16Array;
      // Binary search in sorted array
      let left = 0, right = arr.length - 1;
      while (left <= right) {
        const mid = (left + right) >>> 1;
        if (arr[mid] === lo) return true;
        if (arr[mid] < lo) left = mid + 1;
        else right = mid - 1;
      }
      return false;
    } else {
      const bitmap = this.containers.get(hi) as Uint32Array;
      return (bitmap[lo >>> 5] & (1 << (lo & 31))) !== 0;
    }
  }

  // Bitwise AND (intersection)
  and(other: CompactBitset): CompactBitset {
    const result = new CompactBitset();
    for (const [hi, type] of this.containerTypes) {
      if (!other.containerTypes.has(hi)) continue;
      const thisContainer = this.containers.get(hi)!;
      const otherContainer = other.containers.get(hi)!;
      const otherType = other.containerTypes.get(hi)!;

      if (type === 'bitmap' && otherType === 'bitmap') {
        const a = thisContainer as Uint32Array;
        const b = otherContainer as Uint32Array;
        const res = new Uint32Array(2048);
        let empty = true;
        for (let i = 0; i < 2048; i++) {
          res[i] = a[i] & b[i];
          if (res[i]) empty = false;
        }
        if (!empty) {
          result.containers.set(hi, res);
          result.containerTypes.set(hi, 'bitmap');
        }
      } else if (type === 'array' && otherType === 'array') {
        const a = thisContainer as Uint16Array;
        const b = otherContainer as Uint16Array;
        const intersection: number[] = [];
        let i = 0, j = 0;
        while (i < a.length && j < b.length) {
          if (a[i] === b[j]) { intersection.push(a[i]); i++; j++; }
          else if (a[i] < b[j]) i++;
          else j++;
        }
        if (intersection.length > 0) {
          result.containers.set(hi, new Uint16Array(intersection));
          result.containerTypes.set(hi, 'array');
        }
      } else {
        // Mixed: iterate array, check bitmap
        const arr = type === 'array' ? thisContainer as Uint16Array : otherContainer as Uint16Array;
        const bitmap = type === 'bitmap' ? thisContainer as Uint32Array : otherContainer as Uint32Array;
        const intersection: number[] = [];
        for (let i = 0; i < arr.length; i++) {
          if ((bitmap[arr[i] >>> 5] & (1 << (arr[i] & 31))) !== 0) {
            intersection.push(arr[i]);
          }
        }
        if (intersection.length > 0) {
          result.containers.set(hi, new Uint16Array(intersection));
          result.containerTypes.set(hi, 'array');
        }
      }
    }
    return result;
  }

  // Bitwise OR (union)
  or(other: CompactBitset): CompactBitset {
    const result = new CompactBitset();
    // Copy all entries from this
    for (const [hi, container] of this.containers) {
      const type = this.containerTypes.get(hi)!;
      if (type === 'bitmap') {
        result.containers.set(hi, new Uint32Array(container as Uint32Array));
      } else {
        result.containers.set(hi, new Uint16Array(container as Uint16Array));
      }
      result.containerTypes.set(hi, type);
    }
    // Merge from other
    for (const [hi, container] of other.containers) {
      if (!result.containerTypes.has(hi)) {
        const type = other.containerTypes.get(hi)!;
        if (type === 'bitmap') {
          result.containers.set(hi, new Uint32Array(container as Uint32Array));
        } else {
          result.containers.set(hi, new Uint16Array(container as Uint16Array));
        }
        result.containerTypes.set(hi, type);
      } else {
        // Need to merge. For simplicity convert to bitmap and OR
        const existing = result.containers.get(hi)!;
        const existingType = result.containerTypes.get(hi)!;
        const otherType = other.containerTypes.get(hi)!;

        let bitmap: Uint32Array;
        if (existingType === 'bitmap') {
          bitmap = new Uint32Array(existing as Uint32Array);
        } else {
          bitmap = new Uint32Array(2048);
          const arr = existing as Uint16Array;
          for (let i = 0; i < arr.length; i++) bitmap[arr[i] >>> 5] |= (1 << (arr[i] & 31));
        }

        if (otherType === 'bitmap') {
          const other32 = container as Uint32Array;
          for (let i = 0; i < 2048; i++) bitmap[i] |= other32[i];
        } else {
          const arr = container as Uint16Array;
          for (let i = 0; i < arr.length; i++) bitmap[arr[i] >>> 5] |= (1 << (arr[i] & 31));
        }

        result.containers.set(hi, bitmap);
        result.containerTypes.set(hi, 'bitmap');
      }
    }
    return result;
  }

  get containerCount(): number { return this.containers.size; }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializeAdvancedDataStructures(): void {
  log.info('[AdvancedDataStructures] Techniques 40-49, 53, 55: Advanced data structures initialized');
}

export function shutdownAdvancedDataStructures(): void {
  queryResultCache.clear();
  thumbnailCache.clear();
  rewindSnapshotCache.clear();
  ipcResponseCache.clear();
  routeHandlerCache.clear();
  logRingBuffer.clear();
  eventRingBuffer.clear();
  perfRingBuffer.clear();
  dbKeyExistenceFilter.clear();
  urlVisitedFilter.clear();
  duplicateEventFilter.clear();
  pluginBlacklistFilter.clear();
}
