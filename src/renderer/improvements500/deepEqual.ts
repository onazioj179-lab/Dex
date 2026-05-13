// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Structural deep equality for plain JS values. Handles arrays, plain
 * objects, Date, NaN, and cyclic references. Functions and class
 * instances are compared by identity.
 */

export function deepEqual(a: unknown, b: unknown): boolean {
  return equalInner(a, b, new WeakMap());
}

function equalInner(a: unknown, b: unknown, seen: WeakMap<object, object>): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  // Cycle protection: if we've already paired a with b before, treat equal.
  const existing = seen.get(a);
  if (existing === b) return true;
  seen.set(a, b);

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equalInner(a[i], b[i], seen)) return false;
    return true;
  }
  // Plain object compare.
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!equalInner(ao[k], bo[k], seen)) return false;
  }
  return true;
}
