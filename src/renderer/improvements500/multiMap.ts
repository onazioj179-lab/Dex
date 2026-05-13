// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
export class MultiMap<K, V> {
  private readonly inner = new Map<K, V[]>();
  private _size = 0;

  add(key: K, value: V): void {
    let arr = this.inner.get(key);
    if (!arr) {
      arr = [];
      this.inner.set(key, arr);
    }
    arr.push(value);
    this._size++;
  }

  get(key: K): readonly V[] {
    return this.inner.get(key) ?? [];
  }

  has(key: K): boolean {
    return this.inner.has(key);
  }

  delete(key: K, value?: V): boolean {
    if (value === undefined) {
      const arr = this.inner.get(key);
      if (!arr) return false;
      this._size -= arr.length;
      return this.inner.delete(key);
    }
    const arr = this.inner.get(key);
    if (!arr) return false;
    const idx = arr.indexOf(value);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    this._size--;
    if (arr.length === 0) this.inner.delete(key);
    return true;
  }

  keys(): IterableIterator<K> {
    return this.inner.keys();
  }

  *entries(): IterableIterator<[K, V]> {
    for (const [k, arr] of this.inner) for (const v of arr) yield [k, v];
  }

  get size(): number {
    return this._size;
  }

  clear(): void {
    this.inner.clear();
    this._size = 0;
  }
}
