// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { degreeCentrality, topHubs } from '../../src/shared/nexus/centrality';

function hub(): NexusModel {
  const m = new NexusModel();
  ['a', 'b', 'c', 'd'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
  m.link('a', 'b');
  m.link('a', 'c');
  m.link('a', 'd');
  return m;
}

describe('nexus centrality', () => {
  it('ranks the hub first', () => {
    const scores = degreeCentrality(hub());
    expect(scores[0].entity.id).toBe('a');
    expect(scores[0].outDegree).toBe(3);
    expect(scores[0].inDegree).toBe(0);
    expect(scores[0].degree).toBe(3);
  });

  it('counts in-degree on the leaves', () => {
    const scores = degreeCentrality(hub());
    const b = scores.find((s) => s.entity.id === 'b')!;
    expect(b.inDegree).toBe(1);
    expect(b.outDegree).toBe(0);
  });

  it('topHubs returns the most connected', () => {
    expect(topHubs(hub(), 1).map((e) => e.id)).toEqual(['a']);
  });

  it('handles an empty model', () => {
    expect(degreeCentrality(new NexusModel())).toEqual([]);
  });
});
