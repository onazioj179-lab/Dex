// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Helpers to serialize/deserialize form-encoded payloads with array support
 * (`a[]=1&a[]=2`) and to convert to/from plain objects.
 */

export type FormValue = string | number | boolean | null | undefined;
export type FormShape = Record<string, FormValue | FormValue[]>;

export function objectToFormData(obj: FormShape): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === null || item === undefined) continue;
        params.append(`${k}[]`, String(item));
      }
    } else {
      params.append(k, String(v));
    }
  }
  return params.toString();
}

export function formDataToObject(input: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (typeof input !== 'string' || input.length === 0) return out;
  const params = new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  for (const key of new Set(Array.from(params.keys()))) {
    const baseKey = key.endsWith('[]') ? key.slice(0, -2) : key;
    const values = params.getAll(key);
    const existing = out[baseKey];
    if (key.endsWith('[]') || values.length > 1) {
      const arr = Array.isArray(existing) ? existing : (typeof existing === 'string' ? [existing] : []);
      for (const v of values) arr.push(v);
      out[baseKey] = arr;
    } else {
      out[baseKey] = values[0] ?? '';
    }
  }
  return out;
}
