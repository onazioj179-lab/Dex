// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * typeGuards -- runtime type predicates used at IPC, plugin, and JSON parse
 * boundaries throughout DEX.
 *
 * Rules:
 *  - Each guard is a pure boolean predicate, never throws.
 *  - Guards are composable: combine with `and`, `or`, `arrayOf`, `recordOf`.
 *  - All exported as named functions so they are tree-shaken if unused.
 */

export type Guard<T> = (v: unknown) => v is T;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export const isString = (v: unknown): v is string => typeof v === 'string';
export const isNumber = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
export const isNull = (v: unknown): v is null => v === null;
export const isUndefined = (v: unknown): v is undefined => v === undefined;
export const isNullish = (v: unknown): v is null | undefined => v === null || v === undefined;
export const isNonNullish = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export const isFiniteNumber = (v: unknown): v is number => isNumber(v) && Number.isFinite(v);
export const isPositiveInteger = (v: unknown): v is number =>
  isNumber(v) && Number.isInteger(v) && v > 0;
export const isNonNegativeInteger = (v: unknown): v is number =>
  isNumber(v) && Number.isInteger(v) && v >= 0;

// ---------------------------------------------------------------------------
// Structural
// ---------------------------------------------------------------------------
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

export const isRecord = isObject;

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------
export function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (v): v is T[] => Array.isArray(v) && v.every(guard);
}

export function recordOf<T>(guard: Guard<T>): Guard<Record<string, T>> {
  return (v): v is Record<string, T> => {
    if (!isObject(v)) return false;
    return Object.values(v).every(guard);
  };
}

export function maybe<T>(guard: Guard<T>): Guard<T | undefined> {
  return (v): v is T | undefined => v === undefined || guard(v);
}

export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (v): v is T | null => v === null || guard(v);
}

export function and<A, B extends A>(a: Guard<A>, b: Guard<B>): Guard<B> {
  return (v): v is B => a(v) && b(v);
}

export function or<A, B>(a: Guard<A>, b: Guard<B>): Guard<A | B> {
  return (v): v is A | B => a(v) || b(v);
}

export function literal<T extends string | number | boolean>(val: T): Guard<T> {
  return (v): v is T => v === val;
}

export function oneOf<T extends string | number>(...vals: T[]): Guard<T> {
  const set = new Set<unknown>(vals);
  return (v): v is T => set.has(v);
}

// ---------------------------------------------------------------------------
// Shape checks  (structural typing for IPC payloads)
// ---------------------------------------------------------------------------

/** Check that `v` has all listed keys (and they are not undefined). */
export function hasKeys<K extends string>(v: unknown, keys: K[]): v is Record<K, unknown> {
  if (!isObject(v)) return false;
  return keys.every(k => k in v);
}

/** Lightweight "shape" check: provide a partial guard map. */
export function shapeOf<T extends Record<string, unknown>>(
  spec: { [K in keyof T]: Guard<T[K]> },
): Guard<T> {
  return (v): v is T => {
    if (!isObject(v)) return false;
    for (const key of Object.keys(spec) as (keyof T)[]) {
      if (!spec[key](v[key as string])) return false;
    }
    return true;
  };
}

// ---------------------------------------------------------------------------
// DEX-specific
// ---------------------------------------------------------------------------

/** A value that came back from IPC and might be a serialized Error. */
export const isSerializedError = shapeOf<{ code: string; message: string }>({
  code: isString,
  message: isString,
});

/** ISO-8601 timestamp string. */
export const isISODateString = (v: unknown): v is string =>
  isString(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);

/** A valid file path (non-empty string). */
export const isFilePath = (v: unknown): v is string =>
  isString(v) && v.trim().length > 0;

/** Hex color. */
export const isHexColor = (v: unknown): v is string =>
  isString(v) && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
