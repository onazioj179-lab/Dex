// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Tiny CRDT primitives: last-write-wins register and grow-only counter.
 *
 * Used by the collaborative cursor / kanban states. Both are mergeable
 * without a coordinator, so two offline clients can resync.
 */

// DEX v3.8.9 - CRDT primitives

export interface LwwRegister<T> {
  value: T;
  ts: number;
  actor: string;
}

export function lwwInit<T>(value: T, actor: string, ts: number = Date.now()): LwwRegister<T> {
  return { value, ts, actor };
}

export function lwwSet<T>(reg: LwwRegister<T>, value: T, actor: string, ts: number = Date.now()): LwwRegister<T> {
  return { value, ts, actor };
}

export function lwwMerge<T>(a: LwwRegister<T>, b: LwwRegister<T>): LwwRegister<T> {
  if (a.ts > b.ts) return a;
  if (b.ts > a.ts) return b;
  // Tie-breaker: lexicographic actor id wins, deterministically.
  return a.actor >= b.actor ? a : b;
}

export interface GCounter {
  /** actor -> count contributed. */
  parts: Record<string, number>;
}

export function gCounterInit(): GCounter { return { parts: {} }; }

export function gCounterIncr(c: GCounter, actor: string, by: number = 1): GCounter {
  if (by < 0) throw new Error('gCounter only grows');
  return { parts: { ...c.parts, [actor]: (c.parts[actor] ?? 0) + by } };
}

export function gCounterValue(c: GCounter): number {
  let n = 0;
  for (const v of Object.values(c.parts)) n += v;
  return n;
}

export function gCounterMerge(a: GCounter, b: GCounter): GCounter {
  const parts: Record<string, number> = { ...a.parts };
  for (const [k, v] of Object.entries(b.parts)) parts[k] = Math.max(parts[k] ?? 0, v);
  return { parts };
}
