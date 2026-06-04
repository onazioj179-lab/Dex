import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { findOrphans, orphanCount, isOrphan } from '../../src/shared/nexus/orphans';

function model(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'a', kind: 'file', label: 'A', ts: 1 });
  m.upsertEntity({ id: 'b', kind: 'file', label: 'B', ts: 2 });
  m.upsertEntity({ id: 'c', kind: 'file', label: 'C', ts: 3 }); // orphan
  m.upsertEntity({ id: 'd', kind: 'file', label: 'D', ts: 0 }); // orphan (oldest)
  m.link('a', 'b');
  return m;
}

describe('nexus orphans', () => {
  it('finds entities with no relations, oldest first', () => {
    expect(findOrphans(model()).map((e) => e.id)).toEqual(['d', 'c']);
  });

  it('counts orphans', () => {
    expect(orphanCount(model())).toBe(2);
  });

  it('isOrphan distinguishes linked vs unlinked', () => {
    const m = model();
    expect(isOrphan(m, 'c')).toBe(true);
    expect(isOrphan(m, 'a')).toBe(false); // has outgoing
    expect(isOrphan(m, 'b')).toBe(false); // has incoming
    expect(isOrphan(m, 'zzz')).toBe(false); // unknown
  });

  it('no orphans when all linked', () => {
    const m = new NexusModel();
    m.upsertEntity({ id: 'x', kind: 'file', label: 'X', ts: 1 });
    m.upsertEntity({ id: 'y', kind: 'file', label: 'Y', ts: 1 });
    m.link('x', 'y');
    m.link('y', 'x');
    expect(findOrphans(m)).toEqual([]);
  });
});
