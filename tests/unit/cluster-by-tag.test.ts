import { describe, it, expect } from 'vitest';
import { clusterByTag, tagFrequencies, relatedByTag } from '../../src/shared/nexus/clusterByTag';

const items = [
  { id: 'a', tags: ['x', 'y'] },
  { id: 'b', tags: ['x'] },
  { id: 'c', tags: ['z'] },
  { id: 'd' }, // untagged
];

describe('cluster by tag', () => {
  it('clusters by tag, largest first', () => {
    const clusters = clusterByTag(items);
    expect(clusters[0]).toEqual({ tag: 'x', ids: ['a', 'b'], count: 2 });
    expect(clusters.map((c) => c.tag)).toEqual(['x', 'y', 'z']);
  });

  it('computes tag frequencies', () => {
    expect(tagFrequencies(items)).toEqual([
      { tag: 'x', count: 2 },
      { tag: 'y', count: 1 },
      { tag: 'z', count: 1 },
    ]);
  });

  it('finds items related by shared tags', () => {
    expect(relatedByTag(items, 'a')).toEqual(['b']); // shares 'x'
    expect(relatedByTag(items, 'c')).toEqual([]);
    expect(relatedByTag(items, 'd')).toEqual([]); // untagged
  });

  it('is case-insensitive on tags', () => {
    const c = clusterByTag([{ id: '1', tags: ['Foo'] }, { id: '2', tags: ['foo'] }]);
    expect(c[0]).toEqual({ tag: 'foo', ids: ['1', '2'], count: 2 });
  });
});
