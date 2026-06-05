// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { recentEntities, recentOfKinds, entitiesSince } from '../../src/shared/nexus/recentEntities';

function model(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'a', kind: 'file', label: 'A', ts: 1 });
  m.upsertEntity({ id: 'b', kind: 'project', label: 'B', ts: 3 });
  m.upsertEntity({ id: 'c', kind: 'idea', label: 'C', ts: 2 });
  return m;
}

describe('nexus recent entities', () => {
  it('returns most-recent across kinds', () => {
    expect(recentEntities(model()).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('respects the limit', () => {
    expect(recentEntities(model(), 2).map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('filters by kinds', () => {
    expect(recentOfKinds(model(), ['file', 'project']).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('filters by since timestamp', () => {
    expect(entitiesSince(model(), 2).map((e) => e.id)).toEqual(['b', 'c']);
  });
});
