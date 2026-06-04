import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { serializeModel, deserializeModel, toJSON, fromJSON } from '../../src/shared/nexus/serialize';

function sample(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'a', kind: 'file', label: 'A', ts: 2 });
  m.upsertEntity({ id: 'b', kind: 'file', label: 'B', ts: 1 });
  m.link('a', 'b', 'related', 3);
  return m;
}

describe('nexus serialize', () => {
  it('serializes entities and relations', () => {
    const s = serializeModel(sample());
    expect(s.version).toBe(1);
    expect(s.entities.map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(s.relations).toEqual([{ from: 'a', to: 'b', kind: 'related', weight: 3 }]);
  });

  it('deserializes back into an equivalent model', () => {
    const m2 = deserializeModel(serializeModel(sample()));
    expect(m2.hasEntity('a')).toBe(true);
    expect(m2.relatedTo('a').map((e) => e.id)).toEqual(['b']);
    expect(m2.relationsFrom('a')[0].weight).toBe(3);
  });

  it('round-trips through JSON', () => {
    const m2 = fromJSON(toJSON(sample()));
    expect(m2.entityCount()).toBe(2);
    expect(m2.relatedTo('a').map((e) => e.id)).toEqual(['b']);
  });

  it('tolerates malformed entries', () => {
    const m = deserializeModel({ version: 1, entities: [{ id: 'x', kind: 'file', label: 'X', ts: 1 } as any, null as any], relations: [null as any] });
    expect(m.entityCount()).toBe(1);
  });
});
