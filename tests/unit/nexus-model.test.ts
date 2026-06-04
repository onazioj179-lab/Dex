import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';

describe('NexusModel', () => {
  it('upserts entities and merges, moving ts forward only', () => {
    const m = new NexusModel();
    m.upsertEntity({ id: 'p1', kind: 'project', label: 'Trailer', ts: 100 });
    m.upsertEntity({ id: 'p1', kind: 'project', label: 'Trailer v2', ts: 50 });
    const e = m.getEntity('p1')!;
    expect(e.label).toBe('Trailer v2');
    expect(e.ts).toBe(100); // ts only moves forward
    expect(m.entityCount()).toBe(1);
  });

  it('lists by kind, most recent first', () => {
    const m = new NexusModel();
    m.upsertEntity({ id: 'a', kind: 'idea', label: 'A', ts: 1 });
    m.upsertEntity({ id: 'b', kind: 'idea', label: 'B', ts: 3 });
    m.upsertEntity({ id: 'c', kind: 'file', label: 'C', ts: 2 });
    expect(m.byKind('idea').map((e) => e.id)).toEqual(['b', 'a']);
    expect(m.byKind('file').map((e) => e.id)).toEqual(['c']);
  });

  it('links and accumulates weight, resolves relatedTo strongest-first', () => {
    const m = new NexusModel();
    ['p', 'x', 'y'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
    m.link('p', 'x', 'related', 1);
    m.link('p', 'y', 'related', 1);
    m.link('p', 'y', 'related', 5); // strengthen y
    expect(m.relatedTo('p').map((e) => e.id)).toEqual(['y', 'x']);
    expect(m.relationsFrom('p')[0].weight).toBe(6);
  });

  it('infers symmetric co-occurrence across a group', () => {
    const m = new NexusModel();
    ['a', 'b', 'c'].forEach((id) => m.upsertEntity({ id, kind: 'session', label: id, ts: 1 }));
    m.inferCoOccurrence(['a', 'b', 'c']);
    expect(m.relatedTo('a').map((e) => e.id).sort()).toEqual(['b', 'c']);
    expect(m.relatedTo('b').map((e) => e.id).sort()).toEqual(['a', 'c']);
  });

  it('removes entities and dangling relations', () => {
    const m = new NexusModel();
    ['a', 'b'].forEach((id) => m.upsertEntity({ id, kind: 'file', label: id, ts: 1 }));
    m.link('a', 'b');
    m.link('b', 'a');
    m.removeEntity('b');
    expect(m.hasEntity('b')).toBe(false);
    expect(m.relatedTo('a')).toHaveLength(0); // dangling relation gone
  });

  it('garbage-collects entities older than a cutoff', () => {
    const m = new NexusModel();
    m.upsertEntity({ id: 'old', kind: 'file', label: 'old', ts: 10 });
    m.upsertEntity({ id: 'new', kind: 'file', label: 'new', ts: 100 });
    expect(m.gcOlderThan(50)).toBe(1);
    expect(m.hasEntity('old')).toBe(false);
    expect(m.hasEntity('new')).toBe(true);
  });
});
