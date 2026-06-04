// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Automation condition evaluation (AutomationEngine trigger rules). Evaluates a
 * `field op value` condition against a context object, and combines a set of
 * conditions with all/any logic. Pure: no DOM, no IO — the engine owns side
 * effects, this owns the predicate.
 */

export type ConditionOp =
  | 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith' | 'exists';

export interface Condition {
  field: string;
  op: ConditionOp;
  value?: unknown;
}

/** Resolve a dotted path ("a.b.c") in a context object. */
function resolve(ctx: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

/** Evaluate one condition against the context. */
export function evaluateCondition(cond: Condition, ctx: Record<string, unknown>): boolean {
  const actual = resolve(ctx, cond.field);
  const expected = cond.value;

  switch (cond.op) {
    case 'exists': return actual !== undefined && actual !== null;
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains': return String(actual).includes(String(expected));
    case 'startsWith': return String(actual).startsWith(String(expected));
    case 'endsWith': return String(actual).endsWith(String(expected));
    default: return false;
  }
}

/** Evaluate a set of conditions combined with 'all' (AND) or 'any' (OR). */
export function evaluateConditions(
  conditions: readonly Condition[],
  ctx: Record<string, unknown>,
  mode: 'all' | 'any' = 'all',
): boolean {
  if (conditions.length === 0) return true; // no conditions → always fires
  return mode === 'all'
    ? conditions.every((c) => evaluateCondition(c, ctx))
    : conditions.some((c) => evaluateCondition(c, ctx));
}
