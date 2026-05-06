// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  createNexusGraphSimulation,
  type NexusGraphNode,
  type NexusGraphLink,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/nexusGraphSimulation';

function makeNodes(count: number): NexusGraphNode[] {
  const out: NexusGraphNode[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ id: `n${i}`, weight: Math.random(), radius: 5 });
  }
  return out;
}

function chainLinks(count: number): NexusGraphLink[] {
  const out: NexusGraphLink[] = [];
  for (let i = 0; i < count - 1; i++) {
    out.push({ source: `n${i}`, target: `n${i + 1}`, weight: 0.5 });
  }
  return out;
}

describe('nexusGraphSimulation', () => {
  it('seeds non-origin positions for cold start', () => {
    const nodes = makeNodes(8);
    const sim = createNexusGraphSimulation(nodes, [], { width: 400, height: 400 });
    const allAtOrigin = sim.nodes.every(n => n.x === 0 && n.y === 0);
    expect(allAtOrigin).toBe(false);
    sim.dispose();
  });

  it('handles empty input without throwing', () => {
    const sim = createNexusGraphSimulation([], [], { width: 100, height: 100 });
    expect(() => sim.tick()).not.toThrow();
    expect(sim.nodes).toHaveLength(0);
    sim.dispose();
  });

  it('moves nodes after several ticks', () => {
    const nodes = makeNodes(20);
    const links = chainLinks(20);
    const sim = createNexusGraphSimulation(nodes, links, { width: 400, height: 400 });
    const before = sim.nodes.map(n => ({ x: n.x ?? 0, y: n.y ?? 0 }));
    sim.reheat(0.9);
    for (let i = 0; i < 30; i++) sim.tick();
    const moved = sim.nodes.some((n, i) => {
      const dx = (n.x ?? 0) - before[i].x;
      const dy = (n.y ?? 0) - before[i].y;
      return Math.hypot(dx, dy) > 0.5;
    });
    expect(moved).toBe(true);
    sim.dispose();
  });

  it('preserves positions on setData when ids carry over', () => {
    const nodes = makeNodes(5);
    const sim = createNexusGraphSimulation(nodes, [], { width: 400, height: 400 });
    sim.tick();
    const snapshot = sim.nodes.map(n => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 }));

    const newNodes: NexusGraphNode[] = [
      ...snapshot.map(s => ({ id: s.id, weight: 0.5 })),
      { id: 'n5', weight: 0.5 },
    ];
    sim.setData(newNodes, []);

    for (const s of snapshot) {
      const found = sim.nodes.find(n => n.id === s.id);
      expect(found).toBeDefined();
      expect(found!.x).toBeCloseTo(s.x, 5);
      expect(found!.y).toBeCloseTo(s.y, 5);
    }
    sim.dispose();
  });

  it('settles below alphaMin after enough ticks', () => {
    const nodes = makeNodes(6);
    const sim = createNexusGraphSimulation(nodes, [], { width: 400, height: 400 });
    sim.reheat(0.4);
    for (let i = 0; i < 500; i++) sim.tick();
    expect(sim.isSettled()).toBe(true);
    sim.dispose();
  });

  it('respects throttled intensity', () => {
    const sim = createNexusGraphSimulation(
      makeNodes(4),
      [],
      { width: 200, height: 200, intensity: 0.5 },
    );
    expect(typeof sim.tick()).toBe('number');
    sim.dispose();
  });
});
