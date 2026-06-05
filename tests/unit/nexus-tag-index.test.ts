// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { buildTagIndex, entitiesByTag, tagCloud } from '../../src/shared/nexus/tagIndex';

function seed(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'e1', kind: 'project', label: 'A', ts: 2, tags: ['Design', 'ux'] });
  m.upsertEntity({ id: 'e2', kind: 'file', label: 'B', ts: 1, tags: ['design'] });
  m.upsertEntity({ id: 'e3', kind: 'idea', label: 'C', ts: 3 }); // no tags
  return m;
}

describe('nexus tag index', () => {
  it('builds an inverted index (case-insensitive)', () => {
    const idx = buildTagIndex(seed());
    expect(idx.get('design')!.sort()).toEqual(['e1', 'e2']);
    expect(idx.get('ux')).toEqual(['e1']);
  });

  it('lists entities by tag, recent first', () => {
    expect(entitiesByTag(seed(), 'design').map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('builds a frequency-ranked tag cloud', () => {
    expect(tagCloud(seed())).toEqual([{ tag: 'design', count: 2 }, { tag: 'ux', count: 1 }]);
  });
});
