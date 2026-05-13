// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Recursive merge of plain objects with configurable array handling.
 * Used by Settings layering (defaults <- user <- workspace) and plugin
 * config merging.
 */

export type ArrayStrategy = 'replace' | 'concat';

export interface DeepMergeOptions { arrays?: ArrayStrategy; }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (v.constructor === Object || Object.getPrototypeOf(v) === null);

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>, opts: DeepMergeOptions = {}): T {
  const strategy = opts.arrays ?? 'replace';
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const tv = (target as Record<string, unknown>)[key];
    const sv = (source as Record<string, unknown>)[key];
    if (Array.isArray(tv) && Array.isArray(sv)) {
      out[key] = strategy === 'concat' ? [...tv, ...sv] : sv;
    } else if (isPlainObject(tv) && isPlainObject(sv)) {
      out[key] = deepMerge(tv, sv as Partial<typeof tv>, opts);
    } else if (sv !== undefined) {
      out[key] = sv;
    }
  }
  return out as T;
}
