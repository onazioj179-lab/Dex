// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 7 - Workspace continuity + Nexus graph primitives.
 *
 * Two coupled primitives:
 *  - NexusGraph: typed DAG for causal/contextual relationships between
 *    sessions, projects, and artifacts.
 *  - CheckpointStore: deterministic snapshot store with bounded history.
 */

export interface NexusNode {
  readonly id: string;
  readonly type: 'session' | 'project' | 'artifact' | 'event';
  readonly label?: string;
  readonly createdAt: number;
}

export type NexusEdgeKind = 'caused' | 'derived-from' | 'references' | 'continues';

export interface NexusEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: NexusEdgeKind;
  readonly at: number;
}

export class NexusGraph {
  private readonly nodes = new Map<string, NexusNode>();
  private readonly outgoing = new Map<string, NexusEdge[]>();
  private readonly incoming = new Map<string, NexusEdge[]>();

  addNode(node: NexusNode): void {
    if (this.nodes.has(node.id)) throw new Error(`node ${node.id} exists`);
    this.nodes.set(node.id, node);
    this.outgoing.set(node.id, []);
    this.incoming.set(node.id, []);
  }

  addEdge(edge: NexusEdge): void {
    if (!this.nodes.has(edge.from)) throw new Error(`unknown node ${edge.from}`);
    if (!this.nodes.has(edge.to)) throw new Error(`unknown node ${edge.to}`);
    if (edge.from === edge.to) throw new Error('self-edge not allowed');
    if (this.wouldCreateCycle(edge.from, edge.to)) {
      throw new Error(`edge ${edge.from}->${edge.to} would create cycle`);
    }
    this.outgoing.get(edge.from)!.push(edge);
    this.incoming.get(edge.to)!.push(edge);
  }

  neighbors(id: string, direction: 'out' | 'in' | 'both' = 'out'): NexusEdge[] {
    if (direction === 'out') return (this.outgoing.get(id) ?? []).slice();
    if (direction === 'in') return (this.incoming.get(id) ?? []).slice();
    return [...(this.outgoing.get(id) ?? []), ...(this.incoming.get(id) ?? [])];
  }

  /** Shortest causal path from `from` to `to`, or `null` if unreachable. */
  path(from: string, to: string): string[] | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    if (from === to) return [from];
    const queue: string[] = [from];
    const prev = new Map<string, string>();
    const seen = new Set<string>([from]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of this.outgoing.get(cur) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        prev.set(edge.to, cur);
        if (edge.to === to) {
          const out = [to];
          let p = cur;
          while (p !== from) { out.unshift(p); p = prev.get(p)!; }
          out.unshift(from);
          return out;
        }
        queue.push(edge.to);
      }
    }
    return null;
  }

  size(): { nodes: number; edges: number } {
    let edges = 0;
    for (const list of this.outgoing.values()) edges += list.length;
    return { nodes: this.nodes.size, edges };
  }

  hasNode(id: string): boolean { return this.nodes.has(id); }

  private wouldCreateCycle(from: string, to: string): boolean {
    return this.reachable(to, from);
  }

  private reachable(start: string, target: string): boolean {
    const queue: string[] = [start];
    const seen = new Set<string>([start]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === target) return true;
      for (const e of this.outgoing.get(cur) ?? []) {
        if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
      }
    }
    return false;
  }
}

export interface Checkpoint<T> {
  readonly id: string;
  readonly takenAt: number;
  readonly label?: string;
  readonly state: T;
}

export interface CheckpointStoreOptions {
  readonly maxEntries?: number;
}

export class CheckpointStore<T> {
  private readonly entries: Checkpoint<T>[] = [];
  private readonly max: number;

  constructor(opts: CheckpointStoreOptions = {}) {
    this.max = Math.max(1, opts.maxEntries ?? 50);
  }

  snapshot(state: T, label?: string, now: number = Date.now()): Checkpoint<T> {
    const cp: Checkpoint<T> = {
      id: `cp-${now}-${this.entries.length}`,
      takenAt: now,
      label,
      state: deepFreeze(structuredCloneSafe(state)),
    };
    this.entries.push(cp);
    while (this.entries.length > this.max) this.entries.shift();
    return cp;
  }

  restore(id: string): T | null {
    const cp = this.entries.find((c) => c.id === id);
    if (!cp) return null;
    return structuredCloneSafe(cp.state);
  }

  list(): readonly Checkpoint<T>[] { return this.entries.slice(); }

  latest(): Checkpoint<T> | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1]! : null;
  }

  prune(predicate: (cp: Checkpoint<T>) => boolean): number {
    const before = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (predicate(this.entries[i]!)) this.entries.splice(i, 1);
    }
    return before - this.entries.length;
  }

  size(): number { return this.entries.length; }
}

function structuredCloneSafe<T>(v: T): T {
  const sc = (globalThis as { structuredClone?: <X>(x: X) => X }).structuredClone;
  if (typeof sc === 'function') return sc(v);
  return JSON.parse(JSON.stringify(v));
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const key of Object.keys(v)) {
      const child = (v as Record<string, unknown>)[key];
      if (child && typeof child === 'object') deepFreeze(child);
    }
  }
  return v;
}
