// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { IntentRouter } from '../../src/shared/phase6/intentRouter';

describe('Phase 6 - IntentRouter', () => {
  const r = new IntentRouter();

  it('classifies arithmetic', () => {
    const out = r.classify('= 1 + 2 * 3');
    expect(out.kind).toBe('calculate');
    expect(out.args.expression).toContain('1 + 2');
  });

  it('classifies open-app', () => {
    expect(r.classify('open Chrome').kind).toBe('open-app');
    expect(r.classify('launch DEX').kind).toBe('open-app');
  });

  it('classifies find-file', () => {
    const out = r.classify('find file budget');
    expect(out.kind).toBe('find-file');
    expect(out.args.query).toBe('budget');
  });

  it('classifies ask-uki for question words', () => {
    expect(r.classify('what is dex').kind).toBe('ask-uki');
    expect(r.classify('? how does this work').kind).toBe('ask-uki');
  });

  it('classifies web-search', () => {
    expect(r.classify('web typescript handbook').kind).toBe('web-search');
  });

  it('classifies settings navigation', () => {
    expect(r.classify('settings: appearance').kind).toBe('navigate-setting');
  });

  it('classifies command (>) prefix', () => {
    const out = r.classify('> reload-window');
    expect(out.kind).toBe('run-command');
    expect(out.args.command).toBe('reload-window');
  });

  it('returns unknown on empty / unmatched', () => {
    expect(r.classify('').kind).toBe('unknown');
    expect(r.classify('   ').kind).toBe('unknown');
  });

  it('classifyAll returns all matches sorted by confidence', () => {
    const all = r.classifyAll('what is 2 + 2');
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1]!.confidence).toBeGreaterThanOrEqual(all[i]!.confidence);
    }
  });

  it('register custom rules and rejects duplicates', () => {
    const r2 = new IntentRouter();
    r2.register({ id: 'custom', kind: 'unknown', pattern: /^foo$/ });
    expect(() => r2.register({ id: 'custom', kind: 'unknown', pattern: /^bar$/ })).toThrow();
  });
});
