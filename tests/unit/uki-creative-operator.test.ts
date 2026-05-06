// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UKI Creative Operator tests
 * @vitest-environment node
 */

import { describe, it, expect, vi } from 'vitest';
import { UkiCreativeOperator, type CreativeAction } from '../../src/main/uki/domains/UkiCreativeOperator';

function action(over: Partial<CreativeAction> = {}): CreativeAction {
  return {
    appId: 'imosion',
    type: 'apply-effect',
    confidence: 0.9,
    payload: { effect: 'reverb', wet: 0.4 },
    ...over,
  };
}

describe('UkiCreativeOperator', () => {
  it('dispatches a valid action to the whitelisted channel', async () => {
    const op = new UkiCreativeOperator();
    const invoker = vi.fn().mockResolvedValue(undefined);
    const r = await op.dispatch(action(), invoker);
    expect(r.ok).toBe(true);
    expect(r.channel).toBe('imosion:applyEffect');
    expect(invoker).toHaveBeenCalledWith('imosion:applyEffect', { effect: 'reverb', wet: 0.4 });
  });

  it('rejects below the confidence floor', async () => {
    const op = new UkiCreativeOperator({ minConfidence: 0.7 });
    const r = await op.dispatch(action({ confidence: 0.5 }), () => undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/low-confidence/);
  });

  it('rejects unknown app ids', async () => {
    const op = new UkiCreativeOperator();
    const r = await op.dispatch(action({ appId: 'fake' as CreativeAction['appId'] }), () => undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported-app/);
  });

  it('rejects action types that are not whitelisted for the app', async () => {
    const op = new UkiCreativeOperator();
    // Imosion has no 'navigate' channel.
    const r = await op.dispatch(action({ type: 'navigate' }), () => undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-whitelisted');
  });

  it('rejects invalid payloads', async () => {
    const op = new UkiCreativeOperator();
    const r = await op.dispatch(action({ payload: null as unknown as Record<string, unknown> }), () => undefined);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid-payload');
  });

  it('captures invoker failures and records them in audit', async () => {
    const op = new UkiCreativeOperator();
    const invoker = vi.fn().mockRejectedValue(new Error('ipc dead'));
    const r = await op.dispatch(action(), invoker);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/invoker-failed:ipc dead/);
    const audit = op.getAudit();
    expect(audit[0].ok).toBe(false);
    expect(audit[0].action.appId).toBe('imosion');
  });

  it('keeps a bounded audit log', async () => {
    const op = new UkiCreativeOperator({ auditSize: 3 });
    for (let i = 0; i < 10; i++) {
      await op.dispatch(action({ payload: { i } }), () => undefined);
    }
    expect(op.getAudit(50)).toHaveLength(3);
  });

  it('findAudit retrieves a previous dispatch by id', async () => {
    const op = new UkiCreativeOperator();
    const r = await op.dispatch(action(), () => undefined);
    const found = op.findAudit(r.actionId);
    expect(found).toBeDefined();
    expect(found!.action.appId).toBe('imosion');
  });
});
