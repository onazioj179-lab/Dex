// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import { runWorkflow, type NodeHandler } from '../../src/shared/apps/workflows/runner';
import type { WorkflowGraph, TriggerEvent } from '../../src/shared/apps/workflows/workflowGraph';

const graph: WorkflowGraph = {
  id: 'wf', nodes: [
    { id: 't', kind: 'trigger', type: 'fs.watch', capabilities: [], config: { glob: '**/*.md' } },
    { id: 'a', kind: 'action', type: 'http.post', capabilities: ['network'], config: { url: 'x' } },
    { id: 'b', kind: 'action', type: 'log', capabilities: [], config: {} },
  ],
  edges: [{ fromId: 't', toId: 'a' }, { fromId: 'a', toId: 'b' }],
};

const trigger: TriggerEvent = { kind: 'fs', path: 'docs/doc.md', change: 'add' };

function ctx(caps: string[] = ['network']) {
  return {
    log: vi.fn(),
    hasCapability: (c: string) => caps.includes(c),
  };
}

describe('Workflow runner', () => {
  it('runs in topological order, propagates outputs', async () => {
    const seen: string[] = [];
    const handlers: Record<string, NodeHandler> = {
      'http.post': async (n) => { seen.push(n.id); return { posted: true }; },
      'log': async (n, inputs) => { seen.push(n.id); return inputs; },
    };
    const r = await runWorkflow(graph, trigger, handlers, ctx());
    expect(r.ok).toBe(true);
    expect(seen).toEqual(['a', 'b']);
    expect(r.outputs.b).toMatchObject({ posted: true });
  });

  it('skips node missing capability', async () => {
    const handlers: Record<string, NodeHandler> = {
      'http.post': async () => ({}),
      'log': async () => ({}),
    };
    const r = await runWorkflow(graph, trigger, handlers, ctx([]));
    expect(r.skipped).toContain('a');
  });

  it('short-circuits when trigger does not match', async () => {
    const r = await runWorkflow(graph, { kind: 'fs', path: 'x.txt', change: 'add' }, {}, ctx());
    expect(r.ok).toBe(true);
    expect(r.outputs).toEqual({});
    expect(r.skipped).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('runs matching path when graph has multiple triggers', async () => {
    const multi: WorkflowGraph = {
      id: 'wf-multi',
      nodes: [
        { id: 'tfs', kind: 'trigger', type: 'fs.watch', capabilities: [], config: { glob: '**/*.md' } },
        { id: 'tbus', kind: 'trigger', type: 'bus.subscribe', capabilities: [], config: { topic: 'jobs.run' } },
        { id: 'a', kind: 'action', type: 'http.post', capabilities: ['network'], config: { url: 'x' } },
      ],
      edges: [
        { fromId: 'tfs', toId: 'a' },
        { fromId: 'tbus', toId: 'a' },
      ],
    };

    const handlers: Record<string, NodeHandler> = {
      'http.post': async () => ({ posted: true }),
    };

    const ev: TriggerEvent = { kind: 'event-bus', topic: 'jobs.run' };
    const r = await runWorkflow(multi, ev, handlers, ctx());
    expect(r.ok).toBe(true);
    expect(r.outputs.a).toMatchObject({ posted: true });
  });

  it('manual trigger activates trigger-anchored path', async () => {
    const handlers: Record<string, NodeHandler> = {
      'http.post': async () => ({ posted: true }),
      'log': async (_n, inputs) => inputs,
    };
    const r = await runWorkflow(graph, { kind: 'manual', at: Date.now() }, handlers, ctx());
    expect(r.ok).toBe(true);
    expect(r.outputs.a).toMatchObject({ posted: true });
    expect(r.outputs.b).toMatchObject({ posted: true });
  });

  it('fails on missing handler', async () => {
    const r = await runWorkflow(graph, trigger, { 'http.post': async () => ({}) }, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no-handler');
  });

  it('propagates handler error with failedNodeId', async () => {
    const handlers: Record<string, NodeHandler> = {
      'http.post': async () => { throw new Error('boom'); },
      'log': async () => ({}),
    };
    const r = await runWorkflow(graph, trigger, handlers, ctx());
    expect(r.ok).toBe(false);
    expect(r.failedNodeId).toBe('a');
    expect(r.error).toBe('boom');
  });

  it('rejects invalid graph', async () => {
    const bad: WorkflowGraph = { id: 'b', nodes: [], edges: [] };
    const r = await runWorkflow(bad, trigger, {}, ctx());
    expect(r.ok).toBe(false);
    expect(r.error).toContain('graph-invalid');
  });
});
