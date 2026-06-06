// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Linked Window System (GOAL-6D) — the link graph primitive.
 *
 * Windows can be connected so they move/resize as a group (Canvas+Notes,
 * Code+Terminal, …). This is the pure graph model: link/unlink two windows and
 * query the connected group. The drag-to-link UI and coordinated-resize geometry
 * sit on top of this in the shell. Connected components = groups.
 */

export class WindowLinks {
  private adj = new Map<string, Set<string>>();

  private edges(id: string): Set<string> {
    let s = this.adj.get(id);
    if (!s) {
      s = new Set();
      this.adj.set(id, s);
    }
    return s;
  }

  /** Link two windows (idempotent). */
  link(a: string, b: string): void {
    if (a === b) return;
    this.edges(a).add(b);
    this.edges(b).add(a);
  }

  /** Remove the link between two windows (leaves them in their own groups). */
  unlink(a: string, b: string): void {
    this.adj.get(a)?.delete(b);
    this.adj.get(b)?.delete(a);
  }

  /** Remove a window entirely (e.g. it was closed). */
  remove(id: string): void {
    for (const other of this.adj.get(id) ?? []) {
      this.adj.get(other)?.delete(id);
    }
    this.adj.delete(id);
  }

  /** Directly linked? */
  areLinked(a: string, b: string): boolean {
    return this.adj.get(a)?.has(b) ?? false;
  }

  /**
   * The connected group containing `id` (BFS over links), including `id` itself.
   * Sorted for stable output. An unlinked window returns just `[id]`.
   */
  groupOf(id: string): string[] {
    const seen = new Set<string>([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of this.adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return [...seen].sort();
  }

  /** All groups with more than one window (the actual linked clusters). */
  groups(): string[][] {
    const visited = new Set<string>();
    const out: string[][] = [];
    for (const id of this.adj.keys()) {
      if (visited.has(id)) continue;
      const group = this.groupOf(id);
      group.forEach((g) => visited.add(g));
      if (group.length > 1) out.push(group);
    }
    return out;
  }

  clear(): void {
    this.adj.clear();
  }
}
