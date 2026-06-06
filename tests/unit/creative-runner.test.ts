// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { runCreativeGoal } from '../../src/main/uki/creativeRunner';
import {
  getUkiCreativeOperator, _resetUkiCreativeOperator,
} from '../../src/main/uki/domains/UkiCreativeOperator';

interface Captured { channel: string; payload: Record<string, unknown>; }

beforeEach(() => { _resetUkiCreativeOperator(); });

describe('UKI creative runner (#094 live binding)', () => {
  it('runs an NL goal and dispatches the creative op to the app IPC channel', async () => {
    const calls: Captured[] = [];
    const invoker = (channel: string, payload: Record<string, unknown>) => { calls.push({ channel, payload }); };

    const res = await runCreativeGoal('remove background', invoker, {
      appId: 'prism', facts: { layerId: 'L1' },
    });

    expect(res.plan.steps.length).toBeGreaterThan(0);
    expect(res.dispatched).toHaveLength(1);
    expect(res.dispatched[0].ok).toBe(true);
    expect(res.dispatched[0].channel).toBe('prism:applyPreset'); // mutating effect
    expect(calls[0].channel).toBe('prism:applyPreset');
    expect(calls[0].payload).toMatchObject({ op: 'removeBackground', layer: 'L1', mutates: true });
  });

  it('routes a synthesis op to the generate channel', async () => {
    const calls: Captured[] = [];
    const invoker = (channel: string, payload: Record<string, unknown>) => { calls.push({ channel, payload }); };

    const op = getUkiCreativeOperator();
    const r = await op.dispatchCreativeOp(
      { app: 'prism', op: 'generativeFill', params: { sel: 'S1', prompt: 'a blue sky' }, mutates: true },
      invoker,
    );
    expect(r.ok).toBe(true);
    expect(r.channel).toBe('prism:generateImage');
    expect(calls[0].payload).toMatchObject({ op: 'generativeFill', sel: 'S1' });
  });

  it('blocks low-confidence dispatches at the operator gate', async () => {
    const op = getUkiCreativeOperator();
    const r = await op.dispatchCreativeOp(
      { app: 'vinx', op: 'stabilize', params: { clip: 'C1' }, mutates: true },
      () => { throw new Error('should not invoke'); },
      { confidence: 0.1 },
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('low-confidence');
  });
});
