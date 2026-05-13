// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Safe deep clone. Uses `structuredClone` when available, falls back to a
 * recursive JSON-compatible cloner for plain objects/arrays/Date/RegExp/Map/Set.
 * Functions and class instances with custom prototypes are NOT preserved by
 * the fallback path.
 */

export function structClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return cloneFallback(value, new WeakMap()) as T;
}

function cloneFallback(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') return value;
  const cached = seen.get(value as object);
  if (cached !== undefined) return cached;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const m = new Map<unknown, unknown>();
    seen.set(value, m);
    for (const [k, v] of value.entries()) m.set(cloneFallback(k, seen), cloneFallback(v, seen));
    return m;
  }
  if (value instanceof Set) {
    const s = new Set<unknown>();
    seen.set(value, s);
    for (const v of value.values()) s.add(cloneFallback(v, seen));
    return s;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(cloneFallback(item, seen));
    return out;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView & { constructor: new (b: ArrayBuffer) => unknown };
    const buf = (value.buffer as ArrayBuffer).slice(value.byteOffset, value.byteOffset + value.byteLength);
    return new view.constructor(buf);
  }
  const out: Record<string, unknown> = {};
  seen.set(value as object, out);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = cloneFallback(v, seen);
  }
  return out;
}
