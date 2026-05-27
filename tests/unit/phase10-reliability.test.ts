// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { ChaosRegistry, scanForCorruption } from '../../src/shared/phase10/reliabilityKit';

describe('Phase 10 - ChaosRegistry', () => {
  it('triggers fault when probability hits and is enabled', () => {
    const cr = new ChaosRegistry({ random: () => 0 });
    cr.register({ id: 'f1', probability: 0.5, enabled: true, fail: () => new Error('chaos') });
    expect(() => cr.maybeTrigger('f1')).toThrow('chaos');
  });

  it('does not trigger when disabled', () => {
    const cr = new ChaosRegistry({ random: () => 0 });
    cr.register({ id: 'f1', probability: 1, enabled: false, fail: () => new Error('x') });
    expect(cr.maybeTrigger('f1')).toBe(false);
  });

  it('does not trigger when random above probability', () => {
    const cr = new ChaosRegistry({ random: () => 0.99 });
    cr.register({ id: 'f1', probability: 0.5, enabled: true, fail: () => new Error('x') });
    expect(cr.maybeTrigger('f1')).toBe(false);
  });

  it('rejects bad probability and duplicates', () => {
    const cr = new ChaosRegistry();
    expect(() => cr.register({ id: 'a', probability: -1, enabled: true, fail: () => new Error() })).toThrow();
    cr.register({ id: 'a', probability: 0.1, enabled: true, fail: () => new Error() });
    expect(() => cr.register({ id: 'a', probability: 0.1, enabled: true, fail: () => new Error() })).toThrow();
  });

  it('setEnabled toggles', () => {
    const cr = new ChaosRegistry({ random: () => 0 });
    cr.register({ id: 'f', probability: 1, enabled: false, fail: () => new Error('z') });
    expect(cr.maybeTrigger('f')).toBe(false);
    cr.setEnabled('f', true);
    expect(() => cr.maybeTrigger('f')).toThrow('z');
  });
});

describe('Phase 10 - scanForCorruption', () => {
  it('detects missing required fields', () => {
    const r = scanForCorruption({}, [{ path: 'name', type: 'string', required: true }]);
    expect(r.healthy).toBe(false);
    expect(r.issues[0]!.code).toBe('missing-field');
  });

  it('detects wrong types', () => {
    const r = scanForCorruption({ count: 'x' }, [{ path: 'count', type: 'number', required: true }]);
    expect(r.issues[0]!.code).toBe('wrong-type');
  });

  it('detects cycles', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const r = scanForCorruption(obj, []);
    expect(r.issues.some((i) => i.code === 'cycle')).toBe(true);
  });

  it('healthy = true when nothing missing or wrong', () => {
    const r = scanForCorruption({ a: 1, b: 'x' }, [
      { path: 'a', type: 'number', required: true },
      { path: 'b', type: 'string', required: true },
    ]);
    expect(r.healthy).toBe(true);
  });

  it('optional missing field is not an issue', () => {
    const r = scanForCorruption({}, [{ path: 'opt', type: 'string', required: false }]);
    expect(r.healthy).toBe(true);
  });

  it('nested paths supported', () => {
    const r = scanForCorruption(
      { a: { b: 5 } },
      [{ path: 'a.b', type: 'number', required: true }],
    );
    expect(r.healthy).toBe(true);
  });
});
