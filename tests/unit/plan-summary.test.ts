// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { decompose } from '../../src/shared/uki/planner';
import { executePlan } from '../../src/shared/uki/actionExecutor';
import { loadAppSkillRegistry } from '../../src/shared/uki/appSkills';
import { creativeActionRegistry } from '../../src/shared/uki/creativeActions';
import { summarizePlan, summarizeResult, resultCounts } from '../../src/shared/uki/planSummary';

describe('UKI plan summary (#003/#049)', () => {
  it('previews a decomposed plan', () => {
    const plan = decompose('remove background', loadAppSkillRegistry(['prism']), { facts: { layerId: 'L1' } });
    const text = summarizePlan(plan);
    expect(text).toContain('Plan for "remove background"');
    expect(text).toContain('prism.bgRemove');
  });

  it('explains an unmatched goal', () => {
    const plan = decompose('zzzz nonsense', loadAppSkillRegistry(['prism']));
    expect(summarizePlan(plan)).toContain('not understood');
  });

  it('reports run results + counts', async () => {
    const plan = decompose('remove background', loadAppSkillRegistry(['prism']), { facts: { layerId: 'L1' } });
    const res = await executePlan(plan, creativeActionRegistry(), { facts: { layerId: 'L1' } });
    expect(summarizeResult(res)).toContain('OK —');
    const counts = resultCounts(res);
    expect(counts.ok).toBeGreaterThanOrEqual(1);
    expect(counts.total).toBe(res.results.length);
  });
});
