// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * `flattenObject` and `unflatten`. Converts between nested objects and
 * dot-keyed flat maps. Arrays are encoded as `key.0`, `key.1`, ...
 */

export function flattenObject(input: Record<string, unknown>, separator = '.'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  walk(input, '', separator, out);
  return out;
}

function walk(value: unknown, prefix: string, sep: string, out: Record<string, unknown>): void {
  if (value === null || typeof value !== 'object') {
    if (prefix === '') return;
    out[prefix] = value;
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix !== '') {
      out[prefix] = [];
      return;
    }
    for (let i = 0; i < value.length; i += 1) {
      walk(value[i], prefix === '' ? String(i) : `${prefix}${sep}${i}`, sep, out);
    }
    return;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix !== '') {
    out[prefix] = {};
    return;
  }
  for (const k of keys) {
    walk(obj[k], prefix === '' ? k : `${prefix}${sep}${k}`, sep, out);
  }
}

export function unflatten(flat: Record<string, unknown>, separator = '.'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(flat)) {
    const parts = key.split(separator);
    let cursor: Record<string, unknown> | unknown[] = out;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const nextPart = parts[i + 1];
      const nextIsArrayIdx = nextPart !== undefined && /^\d+$/.test(nextPart);
      if (isLast) {
        if (Array.isArray(cursor)) (cursor as unknown[])[Number(part)] = flat[key];
        else (cursor as Record<string, unknown>)[part] = flat[key];
      } else {
        const cur = Array.isArray(cursor) ? (cursor as unknown[])[Number(part)] : (cursor as Record<string, unknown>)[part];
        if (cur === undefined || cur === null || typeof cur !== 'object') {
          const created: Record<string, unknown> | unknown[] = nextIsArrayIdx ? [] : {};
          if (Array.isArray(cursor)) (cursor as unknown[])[Number(part)] = created;
          else (cursor as Record<string, unknown>)[part] = created;
          cursor = created;
        } else {
          cursor = cur as Record<string, unknown> | unknown[];
        }
      }
    }
  }
  return out;
}
