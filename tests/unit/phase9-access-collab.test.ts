// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  auditAria, KeymapRegistry, LWWRegister, ORSet,
} from '../../src/shared/phase9/accessCollab';

describe('Phase 9 - auditAria', () => {
  it('flags missing label on button', () => {
    const issues = auditAria({ role: 'button', keyHandlers: ['Enter'] });
    expect(issues.map((i) => i.code)).toEqual(['missing-label']);
  });

  it('flags missing keyboard activation', () => {
    const issues = auditAria({ role: 'button', label: 'Save' });
    expect(issues.map((i) => i.code)).toContain('missing-keyboard');
  });

  it('flags missing required attrs', () => {
    const issues = auditAria({ role: 'checkbox', label: 'X', keyHandlers: ['Enter'] });
    expect(issues.some((i) => i.code === 'missing-attr' && i.detail.includes('aria-checked'))).toBe(true);
  });

  it('passes on a fully specified slider', () => {
    const issues = auditAria({
      role: 'slider', label: 'Vol', keyHandlers: ['enter'],
      attrs: { 'aria-valuenow': 5, 'aria-valuemin': 0, 'aria-valuemax': 10 },
    });
    expect(issues).toEqual([]);
  });
});

describe('Phase 9 - KeymapRegistry', () => {
  it('register/resolve and chord normalization', () => {
    const r = new KeymapRegistry();
    r.register({ id: 'save', chord: 'Ctrl+S' });
    expect(r.resolve('s+ctrl')?.id).toBe('save');
    expect(r.resolve('Ctrl+S')?.id).toBe('save');
    expect(r.resolve('Ctrl+Shift+S')).toBeNull();
  });

  it('rejects duplicate id and chord conflict', () => {
    const r = new KeymapRegistry();
    r.register({ id: 'a', chord: 'Ctrl+S' });
    expect(() => r.register({ id: 'a', chord: 'Ctrl+T' })).toThrow();
    expect(() => r.register({ id: 'b', chord: 'S+Ctrl' })).toThrow();
  });

  it('scoped chords do not collide', () => {
    const r = new KeymapRegistry();
    r.register({ id: 'a', chord: 'Esc', scope: 'editor' });
    r.register({ id: 'b', chord: 'Esc', scope: 'modal' });
    expect(r.resolve('Esc', 'editor')?.id).toBe('a');
    expect(r.resolve('Esc', 'modal')?.id).toBe('b');
  });

  it('unregister returns false for unknown', () => {
    const r = new KeymapRegistry();
    expect(r.unregister('nope')).toBe(false);
    r.register({ id: 'x', chord: 'F1' });
    expect(r.unregister('x')).toBe(true);
    expect(r.size()).toBe(0);
  });
});

describe('Phase 9 - LWWRegister', () => {
  it('takes higher timestamp', () => {
    const r = new LWWRegister<string>('siteA', 'init', 0);
    expect(r.set('next', 5, 'siteA')).toBe(true);
    expect(r.get()).toBe('next');
    expect(r.set('older', 1, 'siteA')).toBe(false);
    expect(r.get()).toBe('next');
  });

  it('ties broken by site id (lexicographic, larger wins)', () => {
    const r = new LWWRegister<string>('siteA', 'init', 5);
    expect(r.set('z', 5, 'siteB')).toBe(true);
    expect(r.set('y', 5, 'siteA')).toBe(false);
  });

  it('merge applies remote state', () => {
    const r = new LWWRegister<number>('A', 1, 0);
    expect(r.merge({ value: 99, timestamp: 10, siteId: 'B' })).toBe(true);
    expect(r.get()).toBe(99);
  });
});

describe('Phase 9 - ORSet', () => {
  it('add then remove makes value absent', () => {
    const s = new ORSet();
    s.add('x', 't1');
    expect(s.has('x')).toBe(true);
    s.remove('x');
    expect(s.has('x')).toBe(false);
  });

  it('concurrent add wins over earlier remove', () => {
    const s = new ORSet();
    s.add('x', 't1');
    s.remove('x');
    s.add('x', 't2');
    expect(s.has('x')).toBe(true);
  });

  it('values returns sorted unique', () => {
    const s = new ORSet();
    s.add('b', '1');
    s.add('a', '1');
    s.add('a', '2');
    expect(s.values()).toEqual(['a', 'b']);
  });

  it('mergeAdd / mergeRemove are commutative', () => {
    const a = new ORSet();
    const b = new ORSet();
    a.add('x', 't1');
    const removeOps = a.remove('x');
    for (const op of removeOps) b.mergeRemove(op);
    b.mergeAdd({ value: 'x', tag: 't2' });
    expect(b.has('x')).toBe(true);
  });
});
