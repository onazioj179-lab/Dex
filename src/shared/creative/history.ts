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

export interface SnapshotHistoryOptions {
  /** Maximum retained snapshots (current + undo depth). Default 100, min 1. */
  limit?: number;
  /** Coalesce window (ms): a push within this window of the last replaces it
   *  instead of adding a step. 0 disables coalescing. Default 0. */
  coalesceMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
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
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(options: SnapshotHistoryOptions = {}) {
    this.limit = Math.max(1, Math.floor(options.limit ?? 100));
    this.coalesceMs = Math.max(0, options.coalesceMs ?? 0);
    this.now = options.now ?? Date.now;
  }

  /** Record a new snapshot. Truncates any redo tail, caps to `limit`. */
  push(snapshot: T): void {
    const t = this.now();

    // Coalesce rapid edits into the current step instead of a new one.
    if (
      this.coalesceMs > 0 &&
      this.index >= 0 &&
      this.index === this.stack.length - 1 &&
      t - this.stamps[this.index] <= this.coalesceMs
    ) {
      this.stack[this.index] = snapshot;
      this.stamps[this.index] = t;
      return;
    }

    // Drop redo tail beyond the current index.
    if (this.index < this.stack.length - 1) {
      this.stack.length = this.index + 1;
      this.stamps.length = this.index + 1;
    }

    this.stack.push(snapshot);
    this.stamps.push(t);
    this.index = this.stack.length - 1;

    // Enforce the depth cap from the oldest end.
    if (this.stack.length > this.limit) {
      const excess = this.stack.length - this.limit;
      this.stack.splice(0, excess);
      this.stamps.splice(0, excess);
      this.index -= excess;
    }
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
    this.index = -1;
  }
}

/** Convenience factory. */
export function createSnapshotHistory<T>(options?: SnapshotHistoryOptions): SnapshotHistory<T> {
  return new SnapshotHistory<T>(options);
}
