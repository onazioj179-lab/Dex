// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  buildCreativeCommand,
  applyCreativeCommand,
  tierForOps,
  enginePendingApplier,
} from '../../src/shared/uki/creativeCommand';
import type { CreativeOp } from '../../src/shared/uki/creativeActions';

describe('creativeCommand.buildCreativeCommand (#095 NL command bar)', () => {
  it('turns an NL goal into a previewable, confirmable op list', async () => {
    const cmd = await buildCreativeCommand('remove background', {
      appId: 'prism',
      facts: { layerId: 'L1' },
    });

    expect(cmd.understood).toBe(true);
    expect(cmd.ops).toHaveLength(1);
    expect(cmd.ops[0]).toMatchObject({ app: 'prism', op: 'removeBackground', mutates: true });
    // the layerId fact flows into the op params via {{var}} interpolation
    expect(cmd.ops[0].params).toMatchObject({ layer: 'L1' });
    // mutating op -> requires confirmation
    expect(cmd.mutates).toBe(true);
    expect(cmd.tier).toBe('confirm');
    // preview text names the plan
    expect(cmd.summary).toContain('Plan for');
  });

  it('marks read-only ops as auto (no confirm needed)', async () => {
    const cmd = await buildCreativeCommand('detect tempo and key', {
      appId: 'imosion',
      facts: { trackId: 'T1' },
    });
    expect(cmd.understood).toBe(true);
    expect(cmd.ops[0].mutates).toBe(false);
    expect(cmd.tier).toBe('auto');
  });

  it('gracefully reports an unrecognised goal without throwing', async () => {
    const cmd = await buildCreativeCommand('asdfqwer zzz nonsense', { appId: 'prism' });
    expect(cmd.understood).toBe(false);
    expect(cmd.ops).toHaveLength(0);
    expect(cmd.summary.toLowerCase()).toContain('not understood');
  });

  it('respects a forbidden policy at the tier gate', async () => {
    const cmd = await buildCreativeCommand('remove background', {
      appId: 'prism',
      facts: { layerId: 'L1' },
      policy: { forbidden: ['removeBackground'] },
    });
    expect(cmd.tier).toBe('forbidden');
  });
});

describe('creativeCommand.tierForOps', () => {
  const mut = (op: string): CreativeOp => ({ app: 'prism', op, params: {}, mutates: true });
  const ro = (op: string): CreativeOp => ({ app: 'prism', op, params: {}, mutates: false });

  it('picks the strictest tier across the batch', () => {
    expect(tierForOps([ro('a'), ro('b')])).toBe('auto');
    expect(tierForOps([ro('a'), mut('b')])).toBe('confirm');
    expect(tierForOps([mut('a')], { forbidden: ['a'] })).toBe('forbidden');
  });

  it('autoAllow overrides a mutating op to auto', () => {
    expect(tierForOps([mut('autoEnhance')], { autoAllow: ['autoEnhance'] })).toBe('auto');
  });
});

describe('creativeCommand.applyCreativeCommand', () => {
  const op = (name: string): CreativeOp => ({ app: 'prism', op: name, params: {}, mutates: true });

  it('applies every op in order and reports outcomes', async () => {
    const seen: string[] = [];
    const report = await applyCreativeCommand([op('one'), op('two')], (o) => {
      seen.push(o.op);
      return `did ${o.op}`;
    });
    expect(seen).toEqual(['one', 'two']);
    expect(report.applied).toBe(2);
    expect(report.ok).toBe(true);
    expect(report.results[0].note).toBe('did one');
  });

  it('treats an explicit { outcome: skipped } as honest engine-pending, not an error', async () => {
    const report = await applyCreativeCommand([op('upscale')], () => ({
      outcome: 'skipped', note: 'needs AI engine',
    }));
    expect(report.skipped).toBe(1);
    expect(report.applied).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.ok).toBe(true); // skipped is not a failure
    expect(report.results[0]).toMatchObject({ outcome: 'skipped', note: 'needs AI engine' });
  });

  it('enginePendingApplier marks every op as honest skipped with an app-labelled note', async () => {
    const report = await applyCreativeCommand([op('stabilize'), op('removeSilence')], enginePendingApplier('Vinx'));
    expect(report.skipped).toBe(2);
    expect(report.applied).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.results[0].note).toMatch(/needs the Vinx engine/);
  });

  it('a throwing applier fails that op but does not abort the batch', async () => {
    const report = await applyCreativeCommand([op('bad'), op('good')], (o) => {
      if (o.op === 'bad') throw new Error('engine offline');
      return 'ok';
    });
    expect(report.failed).toBe(1);
    expect(report.applied).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.results[0]).toMatchObject({ outcome: 'failed', note: 'engine offline' });
  });
});
