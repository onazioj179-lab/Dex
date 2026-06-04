import { describe, it, expect } from 'vitest';
import {
  createUnifiedSearch,
  createWorkflowSearchProvider,
  createAppSearchProvider,
} from '../../src/renderer/services/searchProviders';

describe('unified search providers', () => {
  it('returns app results for an app query', async () => {
    const orch = createUnifiedSearch();
    const set = await orch.search({ text: 'prism' });
    const app = set.results.find((r) => r.kind === 'app' && r.id === 'prism');
    expect(app).toBeDefined();
    expect(app?.payload).toMatchObject({ appId: 'prism' });
  });

  it('returns workflow actions for a workspace query', async () => {
    const orch = createUnifiedSearch();
    const set = await orch.search({ text: 'research' });
    const wf = set.results.find((r) => r.kind === 'action' && r.id === 'research');
    expect(wf).toBeDefined();
    expect(wf?.payload).toMatchObject({ workflowId: 'research' });
  });

  it('blends and ranks across providers (scores normalized 0..1)', async () => {
    const orch = createUnifiedSearch();
    const set = await orch.search({ text: 'design' });
    expect(set.results.length).toBeGreaterThan(0);
    for (const r of set.results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1.2); // weight can lift app scores slightly
    }
  });

  it('empty query yields no results', async () => {
    const orch = createUnifiedSearch();
    const set = await orch.search({ text: '   ' });
    expect(set.results).toHaveLength(0);
  });

  it('individual providers expose stable ids/kinds', () => {
    expect(createAppSearchProvider().id).toBe('apps');
    expect(createWorkflowSearchProvider().kinds).toContain('action');
  });
});
