// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Query string codec. Single-value semantics with array support via repeated
 * keys. Round-trips encodeURIComponent. No leading "?" - callers add it.
 */

export type QueryValue = string | number | boolean | null;
export type QueryInput = Record<string, QueryValue | ReadonlyArray<QueryValue>>;

export function stringifyQuery(input: QueryInput): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const ek = encodeURIComponent(k);
    if (v === null || v === undefined) {
      parts.push(ek);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (item === null || item === undefined) parts.push(ek);
        else parts.push(`${ek}=${encodeURIComponent(String(item))}`);
      }
    } else {
      parts.push(`${ek}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}

export function parseQuery(input: string): Record<string, string | string[]> {
  let s = input;
  if (s.startsWith('?')) s = s.slice(1);
  const out: Record<string, string | string[]> = {};
  if (s.length === 0) return out;
  for (const pair of s.split('&')) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf('=');
    const rawK = eq === -1 ? pair : pair.slice(0, eq);
    const rawV = eq === -1 ? '' : pair.slice(eq + 1);
    let k = rawK;
    let v = rawV;
    try { k = decodeURIComponent(rawK.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    try { v = decodeURIComponent(rawV.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    if (k in out) {
      const cur = out[k];
      if (Array.isArray(cur)) cur.push(v);
      else out[k] = [cur, v];
    } else {
      out[k] = v;
    }
  }
  return out;
}
