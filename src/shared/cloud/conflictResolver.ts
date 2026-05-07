// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Three-way conflict resolver for sync.
 */

// DEX v3.8.9 - conflict resolver

export interface ConflictInput<T> {
  base: T | null;     // common ancestor
  mine: T | null;     // local version
  theirs: T | null;   // remote version
}

export type Resolution<T> =
  | { kind: 'no-conflict'; value: T | null }
  | { kind: 'auto-merged'; value: T }
  | { kind: 'conflict'; mine: T; theirs: T; base: T | null };

/**
 * Generic resolver. If both sides match, no conflict. If only one side
 * changed, that side wins. If both changed differently, surface a conflict.
 */
export function resolveConflict<T>(input: ConflictInput<T>, equals: (a: T | null, b: T | null) => boolean): Resolution<T> {
  const { base, mine, theirs } = input;
  if (equals(mine, theirs)) return { kind: 'no-conflict', value: mine };
  if (equals(mine, base) && theirs !== null) return { kind: 'auto-merged', value: theirs };
  if (equals(theirs, base) && mine !== null) return { kind: 'auto-merged', value: mine };
  if (mine === null || theirs === null) {
    return { kind: 'conflict', mine: (mine ?? theirs) as T, theirs: (theirs ?? mine) as T, base };
  }
  return { kind: 'conflict', mine, theirs, base };
}

/** Strict equality variant for primitives. */
export const strictEquals = <T,>(a: T | null, b: T | null) => a === b;

/** Deep equality via JSON for plain objects. */
export const jsonEquals = <T,>(a: T | null, b: T | null) => JSON.stringify(a) === JSON.stringify(b);
