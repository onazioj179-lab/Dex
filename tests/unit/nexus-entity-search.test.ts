// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { searchEntities } from '../../src/shared/nexus/entitySearch';

function seed(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'p1', kind: 'project', label: 'Trailer Edit', ts: 30, tags: ['video'] });
  m.upsertEntity({ id: 'p2', kind: 'project', label: 'Album Art', ts: 20 });
  m.upsertEntity({ id: 'i1', kind: 'idea', label: 'Trailer hook', ts: 10 });
  m.upsertEntity({ id: 'f1', kind: 'file', label: 'budget.xlsx', ts: 40, tags: ['finance'] });
  return m;
}

describe('nexus entity search', () => {
  it('finds entities matching a query across kinds', () => {
    const hits = searchEntities(seed(), 'trailer');
    const ids = hits.map((h) => h.entity.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('i1');
    expect(ids).not.toContain('p2');
  });

  it('matches tags too', () => {
    const hits = searchEntities(seed(), 'finance');
    expect(hits.map((h) => h.entity.id)).toContain('f1');
  });

  it('scopes to a kind', () => {
    const hits = searchEntities(seed(), 'trailer', { kind: 'project' });
    const ids = hits.map((h) => h.entity.id);
    expect(ids).toContain('p1');
    expect(ids).not.toContain('i1'); // idea excluded by kind scope
  });

  it('empty query returns most-recent entities', () => {
    const hits = searchEntities(seed(), '');
    expect(hits[0].entity.id).toBe('f1'); // ts 40 newest
  });

  it('respects the limit', () => {
    const hits = searchEntities(seed(), '', { limit: 2 });
    expect(hits).toHaveLength(2);
  });
});
