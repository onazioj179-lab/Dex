// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Immutable priority queue (automation job ordering, render/work scheduling).
 * Higher priority dequeues first; equal priority is FIFO (stable). Operations
 * return new queues — no mutation. Pure: no DOM, no IO.
 */

interface Entry<T> { value: T; priority: number; seq: number }

export interface PriorityQueue<T> {
  readonly entries: ReadonlyArray<Entry<T>>;
  readonly nextSeq: number;
}

/** An empty queue. */
export function emptyQueue<T>(): PriorityQueue<T> {
  return { entries: [], nextSeq: 0 };
}

/** Enqueue a value at a priority (default 0). Returns a new queue. */
export function enqueue<T>(q: PriorityQueue<T>, value: T, priority = 0): PriorityQueue<T> {
  const entry: Entry<T> = { value, priority, seq: q.nextSeq };
  const entries = [...q.entries, entry].sort(
    (a, b) => b.priority - a.priority || a.seq - b.seq,
  );
  return { entries, nextSeq: q.nextSeq + 1 };
}

/** The next value without removing it, or null when empty. */
export function peek<T>(q: PriorityQueue<T>): T | null {
  return q.entries.length ? q.entries[0].value : null;
}

export interface DequeueResult<T> {
  value: T | null;
  queue: PriorityQueue<T>;
}

/** Remove and return the highest-priority value. */
export function dequeue<T>(q: PriorityQueue<T>): DequeueResult<T> {
  if (q.entries.length === 0) return { value: null, queue: q };
  const [head, ...rest] = q.entries;
  return { value: head.value, queue: { entries: rest, nextSeq: q.nextSeq } };
}

export function size<T>(q: PriorityQueue<T>): number { return q.entries.length; }
export function isEmpty<T>(q: PriorityQueue<T>): boolean { return q.entries.length === 0; }

/** Drain the queue into an ordered array (highest priority first). */
export function toArray<T>(q: PriorityQueue<T>): T[] {
  return q.entries.map((e) => e.value);
}
