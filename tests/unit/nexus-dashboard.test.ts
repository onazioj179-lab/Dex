import { describe, it, expect } from 'vitest';
import { NexusModel } from '../../src/shared/nexus/model';
import { nexusDashboard } from '../../src/shared/nexus/dashboard';

function seed(): NexusModel {
  const m = new NexusModel();
  m.upsertEntity({ id: 'p1', kind: 'project', label: 'Proj', ts: 3, tags: ['design'] });
  m.upsertEntity({ id: 'f1', kind: 'file', label: 'File', ts: 2 });
  m.upsertEntity({ id: 'i1', kind: 'idea', label: 'Idea', ts: 1 });
  m.link('p1', 'f1');
  return m;
}

describe('nexus dashboard (integration)', () => {
  it('builds view counts, hubs, tags and stats', () => {
    const d = nexusDashboard(seed());
    const projects = d.views.find((v) => v.id === 'projects')!;
    const files = d.views.find((v) => v.id === 'files')!;
    expect(projects.count).toBe(1);
    expect(projects.label).toBe('Projects');
    expect(files.count).toBe(1);
    expect(d.totalEntities).toBe(3);
    expect(d.stats.nodes).toBe(3);
    expect(d.stats.edges).toBe(1);
    expect(d.tags).toEqual([{ tag: 'design', count: 1 }]);
    expect(d.hubs.map((h) => h.id)).toContain('p1'); // connected entity is a hub
  });

  it('all 8 memory views are present', () => {
    expect(nexusDashboard(new NexusModel()).views).toHaveLength(8);
  });
});
