// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  createActionRegistry, registerActions, executePlan, runGoal,
} from '../../src/shared/uki/actionExecutor';
import type { Plan } from '../../src/shared/uki/planner';
import { loadAppSkillRegistry } from '../../src/shared/uki/appSkills';
import { creativeActionRegistry } from '../../src/shared/uki/creativeActions';

describe('UKI actionExecutor', () => {
  it('runs steps in dependency order and emits an undo trail', async () => {
    const reg = registerActions(createActionRegistry(), {
      'a.one': (p) => ({ did: 'one', p }),
      'a.two': (_p, ctx) => ({ did: 'two', sawPrev: 's1' in ctx.results }),
    });
    const plan: Plan = { id: 'p1', goal: 'g', steps: [
      { id: 's1', actionId: 'a.one', params: { x: 1 } },
      { id: 's2', actionId: 'a.two', params: {}, dependsOn: ['s1'] },
    ] };
    const res = await executePlan(plan, reg, { now: () => 42 });
    expect(res.ok).toBe(true);
    expect(res.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect((res.results[1].value as { sawPrev: boolean }).sawPrev).toBe(true);
    expect(res.undo.length).toBe(2);
    expect(res.undo[0]).toMatchObject({ label: 'a.one', recordedAt: 42 });
  });

  it('interpolates {{var}} from facts and prior step results', async () => {
    const reg = registerActions(createActionRegistry(), {
      echo: (p) => p.value,
      use: (p) => `got:${p.ref}`,
    });
    const plan: Plan = { id: 'p', goal: 'g', steps: [
      { id: 's1', actionId: 'echo', params: { value: '{{name}}' } },
      { id: 's2', actionId: 'use', params: { ref: '{{s1}}' }, dependsOn: ['s1'] },
    ] };
    const res = await executePlan(plan, reg, { facts: { name: 'Ada' } });
    expect(res.results[0].value).toBe('Ada');
    expect(res.results[1].value).toBe('got:Ada');
  });

  it('skips dependents of a failed required step and reports ok=false', async () => {
    const reg = registerActions(createActionRegistry(), {
      boom: () => { throw new Error('nope'); },
      after: () => 'ran',
    });
    const plan: Plan = { id: 'p', goal: 'g', steps: [
      { id: 's1', actionId: 'boom', params: {} },
      { id: 's2', actionId: 'after', params: {}, dependsOn: ['s1'] },
    ] };
    const res = await executePlan(plan, reg);
    expect(res.ok).toBe(false);
    expect(res.results[0].status).toBe('failed');
    expect(res.results[1].status).toBe('skipped');
  });

  it('retries transient failures and treats optional failures as skipped', async () => {
    let calls = 0;
    const reg = registerActions(createActionRegistry(), {
      flaky: () => { calls += 1; if (calls < 3) throw new Error('retry'); return 'ok-now'; },
      opt: () => { throw new Error('x'); },
    });
    const plan: Plan = { id: 'p', goal: 'g', steps: [
      { id: 's1', actionId: 'flaky', params: {}, retries: 3 },
      { id: 's2', actionId: 'opt', params: {}, optional: true },
    ] };
    const res = await executePlan(plan, reg);
    expect(res.ok).toBe(true);
    expect(res.results[0]).toMatchObject({ status: 'ok', attempts: 3 });
    expect(res.results[1].status).toBe('skipped');
  });

  it('fails a required step with no registered handler', async () => {
    const plan: Plan = { id: 'p', goal: 'g', steps: [{ id: 's1', actionId: 'nope', params: {} }] };
    const res = await executePlan(plan, createActionRegistry());
    expect(res.ok).toBe(false);
    expect(res.results[0].error).toContain('no handler');
  });

  it('rejects a structurally invalid plan', async () => {
    const plan: Plan = { id: '', goal: 'g', steps: [] };
    const res = await executePlan(plan, createActionRegistry());
    expect(res.ok).toBe(false);
    expect(res.results[0].error).toContain('plan.id');
  });

  it('runGoal decomposes an NL goal and executes the creative op end-to-end', async () => {
    const skills = loadAppSkillRegistry(['prism']);
    const actions = creativeActionRegistry();
    const res = await runGoal('remove background', skills, actions, {
      appId: 'prism', facts: { layerId: 'L1' },
    });
    expect(res.plan.steps.length).toBeGreaterThan(0);
    expect(res.ok).toBe(true);
    expect(res.results[0].value).toMatchObject({
      app: 'prism', op: 'removeBackground', mutates: true, params: { layer: 'L1' },
    });
  });

  it('runGoal returns ok=false with an empty plan when the goal is not understood', async () => {
    const res = await runGoal('xyzzy nonsense', loadAppSkillRegistry(['prism']), creativeActionRegistry());
    expect(res.plan.steps.length).toBe(0);
    expect(res.ok).toBe(false);
  });
});
