// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Object-keyed cache that holds values via WeakRef so the garbage collector
 * can reclaim them under memory pressure. Key must be an object.
 */

const HAS_WEAKREF = typeof WeakRef === 'function';

export class LruWeak<K extends object, V extends object> {
  private readonly map = new WeakMap<K, WeakRef<V> | V>();

  set(key: K, value: V): void {
    this.map.set(key, HAS_WEAKREF ? new WeakRef(value) : value);
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (HAS_WEAKREF && entry instanceof WeakRef) {
      const v = entry.deref();
      if (v === undefined) {
        this.map.delete(key);
        return undefined;
      }
      return v;
    }
    return entry as V;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }
}
