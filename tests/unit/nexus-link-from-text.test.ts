import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { linkFromText } from '../../src/shared/nexus/linkFromText';

function seed(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 's1', kind: 'session', label: 'Source', ts: 1 });
  m.upsertEntity({ id: 'p1', kind: 'project', label: 'Project Alpha', ts: 1 });
  m.upsertEntity({ id: 'f1', kind: 'file', label: 'Notes', ts: 1 });
  return m;
}

describe('nexus link from text', () => {
  it('links wiki-link references and reports unresolved', () => {
    const m = seed();
    const r = linkFromText(m, 's1', 'see [[Project Alpha]] and [[Unknown]]');
    expect(r.linked).toEqual(['p1']);
    expect(r.unresolved).toEqual(['Unknown']);
    expect(m.relationsFrom('s1').map((rel) => rel.to)).toContain('p1');
  });

  it('links @mentions by label (case-insensitive)', () => {
    const m = seed();
    const r = linkFromText(m, 's1', 'ping @notes');
    expect(r.linked).toEqual(['f1']);
  });

  it('no-ops for an unknown source', () => {
    expect(linkFromText(seed(), 'ghost', '[[Project Alpha]]')).toEqual({ linked: [], unresolved: [] });
  });
});
