import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { buildMemorySections, kindForView, totalMemoryCount } from '../../src/shared/nexus/views';

function seed(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'p1', kind: 'project', label: 'Trailer', ts: 10 });
  m.upsertEntity({ id: 'p2', kind: 'project', label: 'Album', ts: 20 });
  m.upsertEntity({ id: 'i1', kind: 'idea', label: 'Hook', ts: 5 });
  m.upsertEntity({ id: 'f1', kind: 'file', label: 'clip.mov', ts: 30 });
  return m;
}

describe('nexus memory views selector', () => {
  it('maps view ids to entity kinds', () => {
    expect(kindForView('projects')).toBe('project');
    expect(kindForView('people')).toBe('person');
    expect(kindForView('conversations')).toBe('conversation');
    expect(kindForView('graph')).toBeUndefined();
  });

  it('builds one section per memory view with live counts', () => {
    const sections = buildMemorySections(seed());
    expect(sections).toHaveLength(8);
    const projects = sections.find((s) => s.view.id === 'projects')!;
    expect(projects.count).toBe(2);
    expect(projects.recent[0].id).toBe('p2'); // newest first
    const people = sections.find((s) => s.view.id === 'people')!;
    expect(people.count).toBe(0);
    expect(people.recent).toEqual([]);
  });

  it('caps the recent preview', () => {
    const m = new NexusModel();
    for (let i = 0; i < 10; i++) m.upsertEntity({ id: `f${i}`, kind: 'file', label: `f${i}`, ts: i });
    const files = buildMemorySections(m, 3).find((s) => s.view.id === 'files')!;
    expect(files.count).toBe(10);
    expect(files.recent).toHaveLength(3);
    expect(files.recent[0].id).toBe('f9');
  });

  it('totals entities across memory views', () => {
    expect(totalMemoryCount(seed())).toBe(4);
  });
});
