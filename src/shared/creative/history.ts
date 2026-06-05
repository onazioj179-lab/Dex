// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SnapshotHistory — a generic, memory-bounded undo/redo over full state
 * snapshots (Wave 1 — creative-platform consistency: CRT-001, SVC-011/013/014/
 * 016/017). The shared `undoManager` is *command*-based (execute/undo closures);
 * this is the *snapshot* counterpart for apps that hold a single serializable
 * state object (Canvas strokes, Prism layers, AXL model, …) and want plain
 * "remember this state" semantics with a hard depth cap so the stack can never
 * grow without bound.
 *
 * Pure + framework-agnostic (no React, no DOM). Snapshots are stored by
 * reference — callers should push immutable/new values, exactly as React state
 * updates already produce.
 */

export interface SnapshotHistoryOptions<T = unknown> {
  /** Maximum retained snapshots (current + undo depth). Default 100, min 1. */
  limit?: number;
  /** Coalesce window (ms): a push within this window of the last replaces it
   *  instead of adding a step. 0 disables coalescing. Default 0. */
  coalesceMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
  /**
   * Memory budget in bytes. When set (with `sizeOf`), the oldest snapshots are
   * evicted once the estimated total exceeds this — so large snapshots (full
   * Canvas/Prism image state) can't accumulate past a real memory ceiling, even
   * within `limit`. The current snapshot is never evicted. 0 disables. Default 0.
   */
  maxBytes?: number;
  /** Estimated byte size of a snapshot. Required for `maxBytes` to take effect. */
  sizeOf?: (snapshot: T) => number;
}

export interface SnapshotHistoryState {
  size: number;
  index: number;
  canUndo: boolean;
  canRedo: boolean;
}

export class SnapshotHistory<T> {
  private stack: T[] = [];
  private index = -1;
  private stamps: number[] = [];
  private sizes: number[] = [];
  private totalBytes = 0;
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private readonly maxBytes: number;
  private readonly sizeOf?: (snapshot: T) => number;

  constructor(options: SnapshotHistoryOptions<T> = {}) {
    this.limit = Math.max(1, Math.floor(options.limit ?? 100));
    this.coalesceMs = Math.max(0, options.coalesceMs ?? 0);
    this.now = options.now ?? Date.now;
    this.maxBytes = Math.max(0, options.maxBytes ?? 0);
    this.sizeOf = options.sizeOf;
  }

  private measure(snapshot: T): number {
    return this.sizeOf ? Math.max(0, this.sizeOf(snapshot)) : 0;
  }

  /** Evict oldest snapshots until within the byte budget (never the current). */
  private enforceByteCap(): void {
    if (this.maxBytes <= 0) return;
    while (this.stack.length > 1 && this.totalBytes > this.maxBytes) {
      this.totalBytes -= this.sizes[0];
      this.stack.shift();
      this.stamps.shift();
      this.sizes.shift();
      this.index--;
    }
  }

  /** Record a new snapshot. Truncates any redo tail, caps to `limit` + bytes. */
  push(snapshot: T): void {
    const t = this.now();
    const sz = this.measure(snapshot);

    // Coalesce rapid edits into the current step instead of a new one.
    if (
      this.coalesceMs > 0 &&
      this.index >= 0 &&
      this.index === this.stack.length - 1 &&
      t - this.stamps[this.index] <= this.coalesceMs
    ) {
      this.totalBytes += sz - this.sizes[this.index];
      this.stack[this.index] = snapshot;
      this.stamps[this.index] = t;
      this.sizes[this.index] = sz;
      this.enforceByteCap();
      return;
    }

    // Drop redo tail beyond the current index.
    if (this.index < this.stack.length - 1) {
      for (let i = this.index + 1; i < this.sizes.length; i++) this.totalBytes -= this.sizes[i];
      this.stack.length = this.index + 1;
      this.stamps.length = this.index + 1;
      this.sizes.length = this.index + 1;
    }

    this.stack.push(snapshot);
    this.stamps.push(t);
    this.sizes.push(sz);
    this.totalBytes += sz;
    this.index = this.stack.length - 1;

    // Enforce the depth cap from the oldest end.
    if (this.stack.length > this.limit) {
      const excess = this.stack.length - this.limit;
      for (let i = 0; i < excess; i++) this.totalBytes -= this.sizes[i];
      this.stack.splice(0, excess);
      this.stamps.splice(0, excess);
      this.sizes.splice(0, excess);
      this.index -= excess;
    }

    // Enforce the memory budget (may evict more than the depth cap did).
    this.enforceByteCap();
  }

  /** Step back; returns the now-current snapshot, or null if at the start. */
  undo(): T | null {
    if (!this.canUndo()) return null;
    this.index--;
    return this.index >= 0 ? this.stack[this.index] : null;
  }

  /** Step forward; returns the now-current snapshot, or null if at the end. */
  redo(): T | null {
    if (!this.canRedo()) return null;
    this.index++;
    return this.stack[this.index];
  }

  /** The current snapshot (or null when empty). */
  current(): T | null {
    return this.index >= 0 ? this.stack[this.index] : null;
  }

  canUndo(): boolean {
    // The first snapshot is the initial state; there is nothing before it.
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  /** Number of retained snapshots. */
  size(): number {
    return this.stack.length;
  }

  /** Estimated total bytes retained (0 when no `sizeOf` was provided). */
  bytes(): number {
    return this.totalBytes;
  }

  state(): SnapshotHistoryState {
    return {
      size: this.stack.length,
      index: this.index,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  clear(): void {
    this.stack = [];
    this.stamps = [];
    this.sizes = [];
    this.totalBytes = 0;
    this.index = -1;
  }
}

/** Convenience factory. */
export function createSnapshotHistory<T>(options?: SnapshotHistoryOptions<T>): SnapshotHistory<T> {
  return new SnapshotHistory<T>(options);
}

// ---------------------------------------------------------------------------
// React-model helper — for apps that hold undo as `[history: T[], index]` in
// component state (Prism, Forge, …) rather than the class above. Lets them cap
// growth in one line without restructuring, so "unbounded undoStack" can't leak.
// ---------------------------------------------------------------------------

export interface IndexedHistory<T> {
  history: T[];
  index: number;
}

/**
 * Trim an array+index undo history to its newest `limit` entries, dropping the
 * oldest from the front and shifting `index` so it still points at the same
 * snapshot. Returns the same array reference when no trim is needed (cheap to
 * call on every push). Pure.
 */
export function capHistoryTail<T>(history: T[], index: number, limit: number): IndexedHistory<T> {
  const max = Math.max(1, Math.floor(limit));
  if (history.length <= max) return { history, index };
  const drop = history.length - max;
  return { history: history.slice(drop), index: Math.max(0, index - drop) };
}
