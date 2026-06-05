// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { graphStats } from '../../src/shared/nexus/graphStats';

describe('nexus graph stats', () => {
  it('counts nodes, edges, degree and density', () => {
    const m = new NexusModel();
    ['a', 'b', 'c'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
    m.link('a', 'b');
    m.link('a', 'c');
    const s = graphStats(m);
    expect(s.nodes).toBe(3);
    expect(s.edges).toBe(2);
    expect(s.avgOutDegree).toBeCloseTo(2 / 3, 6);
    expect(s.density).toBeCloseTo(2 / 6, 6);
    expect(s.orphans).toBe(0);
  });

  it('counts orphans', () => {
    const m = new NexusModel();
    ['a', 'b', 'd'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
    m.link('a', 'b');
    expect(graphStats(m).orphans).toBe(1); // d
  });

  it('empty model', () => {
    expect(graphStats(new NexusModel())).toEqual({ nodes: 0, edges: 0, avgOutDegree: 0, density: 0, orphans: 0 });
  });
});
