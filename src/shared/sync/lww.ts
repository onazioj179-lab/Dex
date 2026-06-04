// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Sync engine core — Last-Writer-Wins CRDT primitives (local-first sync, no
 * server lock-in). An `LwwRegister` resolves concurrent edits deterministically
 * by timestamp (ties broken by actor id), and an `LwwMap` applies that per key
 * with tombstone deletes — so two devices that edited offline always converge to
 * the same state regardless of merge order. Pure: no DOM, no IO, no network.
 */

export interface LwwRegister<T> {
  value: T;
  timestamp: number;
  actor: string;
  /** Tombstone marker — a deleted key (value is ignored). */
  deleted?: boolean;
}

/** A new register write. */
export function lwwSet<T>(value: T, timestamp: number, actor: string): LwwRegister<T> {
  return { value, timestamp, actor };
}

/**
 * Merge two registers. Higher timestamp wins; ties broken by the
 * lexicographically-greater actor id (deterministic + commutative).
 */
export function lwwMerge<T>(a: LwwRegister<T>, b: LwwRegister<T>): LwwRegister<T> {
  if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp ? a : b;
  if (a.actor !== b.actor) return a.actor > b.actor ? a : b;
  return a; // identical clocks — either is fine
}

export type LwwMap<T> = Record<string, LwwRegister<T>>;

/** Set a key in an LWW map (returns a new map). */
export function lwwMapSet<T>(map: LwwMap<T>, key: string, value: T, timestamp: number, actor: string): LwwMap<T> {
  const next = { ...map };
  const incoming: LwwRegister<T> = { value, timestamp, actor };
  next[key] = map[key] ? lwwMerge(map[key], incoming) : incoming;
  return next;
}

/** Delete a key (a tombstone, so the delete itself merges/wins by timestamp). */
export function lwwMapDelete<T>(map: LwwMap<T>, key: string, timestamp: number, actor: string): LwwMap<T> {
  const next = { ...map };
  const tomb: LwwRegister<T> = { value: undefined as unknown as T, timestamp, actor, deleted: true };
  next[key] = map[key] ? lwwMerge(map[key], tomb) : tomb;
  return next;
}

/** Merge two LWW maps per key (commutative + associative → eventual consistency). */
export function lwwMapMerge<T>(a: LwwMap<T>, b: LwwMap<T>): LwwMap<T> {
  const out: LwwMap<T> = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = a[key] ? lwwMerge(a[key], b[key]) : b[key];
  }
  return out;
}

/** Resolve an LWW map to plain values, dropping tombstoned (deleted) keys. */
export function lwwMapValues<T>(map: LwwMap<T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, reg] of Object.entries(map)) {
    if (!reg.deleted) out[key] = reg.value;
  }
  return out;
}
