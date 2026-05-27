// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusGraph, CheckpointStore } from '../../src/shared/phase7/continuityNexus';

describe('Phase 7 - NexusGraph', () => {
  it('adds nodes and edges; rejects unknowns and self-edges', () => {
    const g = new NexusGraph();
    g.addNode({ id: 'a', type: 'session', createdAt: 0 });
    g.addNode({ id: 'b', type: 'project', createdAt: 0 });
    g.addEdge({ from: 'a', to: 'b', kind: 'caused', at: 1 });
    expect(g.size()).toEqual({ nodes: 2, edges: 1 });
    expect(() => g.addEdge({ from: 'a', to: 'a', kind: 'caused', at: 1 })).toThrow();
    expect(() => g.addEdge({ from: 'a', to: 'missing', kind: 'caused', at: 1 })).toThrow();
  });

  it('rejects cycles', () => {
    const g = new NexusGraph();
    g.addNode({ id: 'a', type: 'session', createdAt: 0 });
    g.addNode({ id: 'b', type: 'session', createdAt: 0 });
    g.addEdge({ from: 'a', to: 'b', kind: 'caused', at: 1 });
    expect(() => g.addEdge({ from: 'b', to: 'a', kind: 'caused', at: 2 })).toThrow();
  });

  it('finds shortest path or null', () => {
    const g = new NexusGraph();
    for (const id of ['a', 'b', 'c', 'd']) g.addNode({ id, type: 'session', createdAt: 0 });
    g.addEdge({ from: 'a', to: 'b', kind: 'caused', at: 0 });
    g.addEdge({ from: 'b', to: 'c', kind: 'caused', at: 0 });
    g.addEdge({ from: 'a', to: 'c', kind: 'caused', at: 0 });
    expect(g.path('a', 'c')).toEqual(['a', 'c']);
    expect(g.path('a', 'd')).toBeNull();
    expect(g.path('a', 'a')).toEqual(['a']);
  });

  it('neighbors filters by direction', () => {
    const g = new NexusGraph();
    g.addNode({ id: 'a', type: 'session', createdAt: 0 });
    g.addNode({ id: 'b', type: 'session', createdAt: 0 });
    g.addEdge({ from: 'a', to: 'b', kind: 'caused', at: 0 });
    expect(g.neighbors('a', 'out').length).toBe(1);
    expect(g.neighbors('a', 'in').length).toBe(0);
    expect(g.neighbors('b', 'in').length).toBe(1);
    expect(g.neighbors('a', 'both').length).toBe(1);
  });
});

describe('Phase 7 - CheckpointStore', () => {
  it('snapshot and restore round-trip', () => {
    const s = new CheckpointStore<{ x: number }>();
    const cp = s.snapshot({ x: 1 }, 'one', 100);
    expect(s.restore(cp.id)).toEqual({ x: 1 });
    expect(s.size()).toBe(1);
  });

  it('caps to maxEntries (FIFO)', () => {
    const s = new CheckpointStore<number>({ maxEntries: 2 });
    const a = s.snapshot(1, 'a', 1);
    s.snapshot(2, 'b', 2);
    s.snapshot(3, 'c', 3);
    expect(s.size()).toBe(2);
    expect(s.restore(a.id)).toBeNull();
  });

  it('latest returns most recent', () => {
    const s = new CheckpointStore<number>();
    s.snapshot(1, 'a', 1);
    const b = s.snapshot(2, 'b', 2);
    expect(s.latest()?.id).toBe(b.id);
  });

  it('prune removes by predicate', () => {
    const s = new CheckpointStore<number>();
    s.snapshot(1, 'a', 1);
    s.snapshot(2, 'b', 2);
    const removed = s.prune((cp) => cp.label === 'a');
    expect(removed).toBe(1);
    expect(s.size()).toBe(1);
  });

  it('snapshots are deeply frozen', () => {
    const s = new CheckpointStore<{ inner: { v: number } }>();
    const cp = s.snapshot({ inner: { v: 5 } });
    expect(Object.isFrozen(cp.state)).toBe(true);
    expect(Object.isFrozen(cp.state.inner)).toBe(true);
  });
});
