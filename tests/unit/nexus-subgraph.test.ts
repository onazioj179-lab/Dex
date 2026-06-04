import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { neighborhood, neighborIds, neighborhoodSize } from '../../src/shared/nexus/subgraph';

function chain(): NexusModel {
  const m = new NexusModel();
  ['a', 'b', 'c', 'd'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
  m.link('a', 'b');
  m.link('b', 'c');
  m.link('c', 'd');
  return m;
}

describe('nexus subgraph', () => {
  it('returns the center at depth 0 and 1-hop neighbors', () => {
    expect(neighborhood(chain(), 'a', 1)).toEqual([
      { id: 'a', depth: 0 },
      { id: 'b', depth: 1 },
    ]);
  });

  it('expands by hop count', () => {
    expect(neighborhood(chain(), 'a', 2).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(neighborIds(chain(), 'a', 3)).toEqual(['b', 'c', 'd']);
  });

  it('counts neighbors excluding the center', () => {
    expect(neighborhoodSize(chain(), 'a', 1)).toBe(1);
    expect(neighborhoodSize(chain(), 'a', 2)).toBe(2);
  });

  it('returns empty for unknown center', () => {
    expect(neighborhood(chain(), 'zzz', 2)).toEqual([]);
  });
});
