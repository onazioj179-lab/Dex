// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================

// DEX v3.8.0 - ActionBus tests

import { describe, it, expect, beforeEach } from 'vitest';
import ActionBus from '../../src/renderer/services/ActionBus';
import { planRisk } from '../../src/shared/types/plan-graph';
import type { PlanGraph } from '../../src/shared/types/plan-graph';

describe('ActionBus', () => {
  beforeEach(() => ActionBus._reset());

  it('runs safe steps in order', async () => {
    const seen: string[] = [];
    ActionBus.register('demo.a', () => { seen.push('a'); });
    ActionBus.register('demo.b', () => { seen.push('b'); });
    const plan: PlanGraph = {
      id: 'p1', utterance: 'do a then b', createdAt: Date.now(),
      risk: 'safe',
      steps: [
        { id: 's1', action: 'demo.a', label: 'A', risk: 'safe' },
        { id: 's2', action: 'demo.b', label: 'B', risk: 'safe', dependsOn: ['s1'] },
      ],
    };
    const results = await ActionBus.execute(plan);
    expect(seen).toEqual(['a', 'b']);
    expect(results.every((r) => r.status === 'done')).toBe(true);
  });

  it('blocks destructive plans until approved', async () => {
    let ran = false;
    ActionBus.register('demo.delete', () => { ran = true; });
    const plan: PlanGraph = {
      id: 'p2', utterance: 'wipe', createdAt: Date.now(),
      risk: 'destructive',
      steps: [{ id: 's', action: 'demo.delete', label: 'Delete', risk: 'destructive' }],
    };
    let awaiting = false;
    ActionBus.on('plan:awaiting-approval', () => { awaiting = true; });
    const promise = ActionBus.execute(plan);
    await new Promise((r) => setTimeout(r, 5));
    expect(awaiting).toBe(true);
    expect(ran).toBe(false);
    ActionBus.approve('p2');
    await promise;
    expect(ran).toBe(true);
  });

  it('skips remaining steps after a failure', async () => {
    ActionBus.register('demo.fail', () => { throw new Error('boom'); });
    ActionBus.register('demo.ok', () => 'ok');
    const plan: PlanGraph = {
      id: 'p3', utterance: 't', createdAt: Date.now(),
      risk: 'safe',
      steps: [
        { id: 's1', action: 'demo.fail', label: 'F', risk: 'safe' },
        { id: 's2', action: 'demo.ok', label: 'O', risk: 'safe' },
      ],
    };
    const results = await ActionBus.execute(plan);
    expect(results[0].status).toBe('failed');
    expect(results[1].status).toBe('skipped');
  });

  it('reports missing handler as failure', async () => {
    const plan: PlanGraph = {
      id: 'p4', utterance: 'x', createdAt: Date.now(),
      risk: 'safe',
      steps: [{ id: 's1', action: 'no.such.action', label: 'X', risk: 'safe' }],
    };
    const results = await ActionBus.execute(plan);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toMatch(/no handler/);
  });

  it('planRisk picks the highest level', () => {
    expect(planRisk([
      { id: 'a', action: 'a', label: 'a', risk: 'safe' },
      { id: 'b', action: 'b', label: 'b', risk: 'reversible' },
      { id: 'c', action: 'c', label: 'c', risk: 'destructive' },
    ])).toBe('destructive');
    expect(planRisk([])).toBe('safe');
  });
});
