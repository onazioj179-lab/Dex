// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Defensive JSON helpers.
 *
 * Persisted store/UI state gets corrupted (partial writes, schema drift, a user
 * editing localStorage). Every app re-implements `try { JSON.parse() } catch`.
 * These centralise it and add an optional validator so a structurally-wrong-but-
 * valid-JSON payload still falls back to a known-good default instead of poisoning
 * the app with the wrong shape.
 */

/**
 * Parse JSON, returning `fallback` on any error. If `validate` is supplied, the
 * parsed value must pass it (a type guard or predicate) or `fallback` is returned
 * — so a payload of the wrong shape can't slip through.
 */
export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (value: unknown) => boolean,
): T {
  if (raw == null || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** Stringify, returning `fallback` (default 'null') if the value can't serialise. */
export function safeJsonStringify(value: unknown, fallback = 'null'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/** True for a plain non-null object (handy as a `validate` for record-shaped state). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
