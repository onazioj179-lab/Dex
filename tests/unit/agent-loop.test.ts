// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { createSkillRegistry, registerSkill } from '../../src/shared/uki/skills';
import { createActionRegistry, registerActions } from '../../src/shared/uki/actionExecutor';
import { runAgent } from '../../src/shared/uki/agentLoop';
import { loadAppSkillRegistry } from '../../src/shared/uki/appSkills';
import { creativeActionRegistry } from '../../src/shared/uki/creativeActions';

describe('UKI agent loop (#001)', () => {
  it('runs a single-shot creative goal and records the scratchpad', async () => {
    const res = await runAgent('remove background', loadAppSkillRegistry(['prism']), creativeActionRegistry(), {
      appId: 'prism', facts: { layerId: 'L1' },
    });
    expect(res.iterations.length).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.facts['result:prism.bgRemove']).toBeDefined();
  });

  it('iterates think→act→observe through the next hook', async () => {
    let skills = createSkillRegistry();
    skills = registerSkill(skills, { id: 's.one', label: 'one', intent: 'step one', plan: { steps: [{ actionId: 'a.one', params: {} }] } });
    skills = registerSkill(skills, { id: 's.two', label: 'two', intent: 'step two', plan: { steps: [{ actionId: 'a.two', params: {} }] } });
    const actions = registerActions(createActionRegistry(), { 'a.one': () => 1, 'a.two': () => 2 });

    const res = await runAgent('step one', skills, actions, {
      maxIterations: 5,
      next: (obs) => (obs.goal === 'step one' ? 'step two' : null),
    });
    expect(res.iterations.map((o) => o.goal)).toEqual(['step one', 'step two']);
    expect(res.ok).toBe(true);
    expect(res.facts['result:a.one']).toBe(1);
    expect(res.facts['result:a.two']).toBe(2);
  });

  it('respects the iteration budget', async () => {
    let skills = createSkillRegistry();
    skills = registerSkill(skills, { id: 's.loop', label: 'loop', intent: 'go', plan: { steps: [{ actionId: 'a', params: {} }] } });
    const actions = registerActions(createActionRegistry(), { a: () => 'x' });
    const res = await runAgent('go', skills, actions, { maxIterations: 3, next: () => 'go' });
    expect(res.iterations.length).toBe(3);
  });
});
