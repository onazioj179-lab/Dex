// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  creativeActionRegistry, creativeActionIds, creativeOpSpec, CREATIVE_ACTION_SPECS,
} from '../../src/shared/uki/creativeActions';
import { runGoal } from '../../src/shared/uki/actionExecutor';
import { loadAppSkillRegistry, totalSkillCount } from '../../src/shared/uki/appSkills';

const CREATIVE_APPS = ['prism', 'vinx', 'imosion', 'flux', 'axl'] as const;

describe('UKI creative actions', () => {
  it('registers a handler for every creative action spec', () => {
    const reg = creativeActionRegistry();
    for (const id of creativeActionIds()) {
      expect(reg.handlers.has(id)).toBe(true);
    }
    expect(creativeActionIds().length).toBe(Object.keys(CREATIVE_ACTION_SPECS).length);
  });

  it('covers every actionId referenced by creative app skills', () => {
    const reg = loadAppSkillRegistry([...CREATIVE_APPS]);
    const known = new Set(creativeActionIds());
    const referenced = new Set<string>();
    for (const s of reg.skills) for (const st of s.plan.steps) referenced.add(st.actionId);
    const missing = [...referenced].filter((a) => !known.has(a));
    expect(missing).toEqual([]);
  });

  it('emits a CreativeOp descriptor carrying the mutates flag', async () => {
    const actions = creativeActionRegistry();
    // mutating op
    const fill = await runGoal('generative fill the sky', loadAppSkillRegistry(['prism']), actions, {
      appId: 'prism', facts: { selectionId: 'S1' },
    });
    expect(fill.results[0].value).toMatchObject({ app: 'prism', op: 'generativeFill', mutates: true });

    // read-only op
    const tempo = await runGoal('detect tempo', loadAppSkillRegistry(['imosion']), actions, {
      appId: 'imosion', facts: { trackId: 'T1' },
    });
    expect(tempo.results[0].value).toMatchObject({ app: 'imosion', op: 'detectTempoKey', mutates: false });
  });

  it('exposes op specs by actionId', () => {
    expect(creativeOpSpec('vinx.silenceRemoval')).toMatchObject({ app: 'vinx', op: 'removeSilence', mutates: true });
    expect(creativeOpSpec('not.a.real.action')).toBeUndefined();
  });

  it('expanded the app skill registry with the new creative-control set', () => {
    // 41 original + 36 creative-control + 11 later additions (e.g. AXL overhaul).
    expect(totalSkillCount()).toBe(88);
  });
});
