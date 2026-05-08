import { describe, it, expect } from 'vitest';
import { validateGraph, topoOrder, matchesTrigger, type WorkflowGraph } from '../../src/shared/apps/workflows/workflowGraph';
import { isDangerousCommand, defaultShellForPlatform, detectLanguage, findLsp } from '../../src/shared/apps/code/terminalAndCode';
import { supports, listFeatures, defaultArtifactsFor, checkReleaseGate } from '../../src/shared/platform/parity';

describe('Workflows', () => {
  const g: WorkflowGraph = {
    id: 'wf', nodes: [
      { id: 't', kind: 'trigger', type: 'fs.watch', capabilities: ['files.read'], config: { glob: '**/*.md' } },
      { id: 'a', kind: 'action', type: 'http.post', capabilities: ['network'], config: {} },
    ],
    edges: [{ fromId: 't', toId: 'a' }],
  };
  it('validates clean graph', () => {
    expect(validateGraph(g)).toEqual([]);
  });
  it('detects cycle', () => {
    const cyc: WorkflowGraph = { ...g, edges: [...g.edges, { fromId: 'a', toId: 't' }] };
    const issues = validateGraph(cyc);
    expect(issues.some(i => i.kind === 'cycle')).toBe(true);
  });
  it('topoOrder is trigger -> action', () => {
    expect(topoOrder(g)).toEqual(['t', 'a']);
  });
  it('matchesTrigger fs.watch glob', () => {
    expect(matchesTrigger(g.nodes[0]!, { kind: 'fs', path: 'docs/x.md', change: 'add' })).toBe(true);
    expect(matchesTrigger(g.nodes[0]!, { kind: 'fs', path: 'docs/x.txt', change: 'add' })).toBe(false);
  });
});

describe('Terminal/Code', () => {
  it('default shell per platform', () => {
    expect(defaultShellForPlatform('win')).toBe('pwsh');
    expect(defaultShellForPlatform('mac')).toBe('zsh');
  });
  it('detects dangerous command', () => {
    expect(isDangerousCommand('rm -rf /')).toBe(true);
    expect(isDangerousCommand('ls -la')).toBe(false);
  });
  it('detects language', () => {
    expect(detectLanguage('a.ts')).toBe('typescript');
    expect(detectLanguage('a.unknown')).toBe('plaintext');
  });
  it('finds builtin lsp', () => {
    expect(findLsp('typescript')?.command).toContain('language-server');
    expect(findLsp('cobol')).toBeNull();
  });
});

describe('Platform parity', () => {
  it('matrix supports flag', () => {
    expect(supports('mac-arm64', 'gptk')).toBe(true);
    expect(supports('mac-x64', 'gptk')).toBe(false);
  });
  it('lists features sorted', () => {
    const arr = listFeatures('win-x64');
    expect([...arr].sort()).toEqual(arr);
  });
  it('artifact defaults include msix on win-x64', () => {
    expect(defaultArtifactsFor('win-x64').some(a => a.format === 'msix')).toBe(true);
  });
  it('release gate flags missing features', () => {
    const r = checkReleaseGate([{ platform: 'mac-x64', features: ['gptk'] }]);
    expect(r.ok).toBe(false);
    expect(r.missing[0]).toEqual({ platform: 'mac-x64', feature: 'gptk' });
  });
});
