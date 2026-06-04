import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyOperatorIntent,
  suggestWorkflows,
  diagnose,
  toPromptContext,
  buildOperatorBriefing,
  getActiveProjectId,
  searchEnvironment,
} from '../../src/renderer/uki/operator';
import { buildSystemPrompt } from '../../src/renderer/uki/identity';
import ContextBus from '../../src/renderer/services/ContextBus';

beforeEach(() => {
  ContextBus._reset();
  ContextBus._setThrottle(0);
});

describe('UKI operator', () => {
  it('routes problem queries to diagnose', () => {
    expect(classifyOperatorIntent('why is the dock not working')).toBe('diagnose');
    expect(classifyOperatorIntent('DEX is running hot and the fans are loud')).toBe('diagnose');
  });

  it('routes resume queries to continue and setup queries to launch-workflow', () => {
    expect(classifyOperatorIntent('continue where I left off')).toBe('continue');
    expect(classifyOperatorIntent('restore my session')).toBe('continue');
    expect(classifyOperatorIntent('set up a research workspace')).toBe('launch-workflow');
    expect(classifyOperatorIntent('open notes')).toBe('launch-workflow');
    expect(classifyOperatorIntent('hello there')).toBe('general');
    expect(classifyOperatorIntent('')).toBe('general');
  });

  it('routes retrieval queries to search', () => {
    expect(classifyOperatorIntent('find my design files')).toBe('search');
    expect(classifyOperatorIntent('where is prism')).toBe('search');
    expect(classifyOperatorIntent('look for the research workspace')).toBe('search');
  });

  it('retrieves apps and workflows from the environment', async () => {
    const results = await searchEnvironment('prism');
    expect(results.some((r) => r.kind === 'app' && r.id === 'prism')).toBe(true);
    const wf = await searchEnvironment('research');
    expect(wf.some((r) => r.kind === 'action' && r.id === 'research')).toBe(true);
    expect(await searchEnvironment('   ')).toHaveLength(0);
  });

  it('suggests workflows by overlap with open apps', () => {
    const dev = suggestWorkflows(['dexcode', 'browser']);
    expect(dev[0].id).toBe('development');
    // With nothing open, it falls back to the first templates.
    expect(suggestWorkflows([]).length).toBeGreaterThan(0);
  });

  it('diagnoses an overheating complaint', () => {
    const hits = diagnose('the fans are loud and it gets really hot');
    expect(hits[0]?.id).toBe('overheating');
  });

  it('reads the active project from the continuity channel', () => {
    expect(getActiveProjectId()).toBeUndefined();
    ContextBus.emit('continuity:project', { projectId: 'dexp_abc', source: 'test' });
    expect(getActiveProjectId()).toBe('dexp_abc');
  });

  it('maps a briefing to the prompt context shape', () => {
    const briefing = buildOperatorBriefing({
      foregroundAppId: 'dexcode',
      openAppIds: ['dexcode', 'browser'],
      sessionHistory: [],
      online: true,
      localTime: '10:00 AM',
    });
    const ctx = toPromptContext(briefing);
    expect(ctx.foregroundAppId).toBe('dexcode');
    expect(ctx.activeWorkflows).toContain('development');
  });

  it('surfaces project + workflows in the system prompt', () => {
    ContextBus.emit('continuity:project', { projectId: 'dexp_xyz', source: 'test' });
    const briefing = buildOperatorBriefing({
      foregroundAppId: 'notes',
      openAppIds: ['notes', 'browser', 'nexus'],
      sessionHistory: [],
      online: true,
      localTime: '09:00 AM',
    });
    const prompt = buildSystemPrompt(toPromptContext(briefing));
    expect(prompt).toContain('project=dexp_xyz');
    expect(prompt).toContain('workflows=');
  });
});
