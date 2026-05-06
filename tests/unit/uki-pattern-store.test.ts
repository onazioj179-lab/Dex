// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================

// DEX v3.8.0 - UKIPatternStore tests

import { describe, it, expect, beforeEach } from 'vitest';
import UKIPatternStore, { hashContext } from '../../src/renderer/services/UKIPatternStore';

describe('UKIPatternStore', () => {
  beforeEach(() => {
    UKIPatternStore._useMemory();
    return UKIPatternStore.clear();
  });

  it('hashContext is order-independent', () => {
    expect(hashContext(['a', 'b', 'c'])).toBe(hashContext(['c', 'a', 'b']));
    expect(hashContext(['a'])).not.toBe(hashContext(['b']));
  });

  it('records and counts repeated actions', async () => {
    await UKIPatternStore.record('open.notes', ['app:dock', 'time:morning']);
    await UKIPatternStore.record('open.notes', ['app:dock', 'time:morning']);
    await UKIPatternStore.record('open.code', ['app:dock', 'time:morning']);
    const s = await UKIPatternStore.suggest(['time:morning', 'app:dock'], 5);
    expect(s[0].action).toBe('open.notes');
    expect(s[0].count).toBe(2);
    expect(s[0].confidence).toBeGreaterThan(0.5);
  });

  it('returns nothing for unknown context', async () => {
    const s = await UKIPatternStore.suggest(['never:seen'], 3);
    expect(s).toEqual([]);
  });

  it('size grows with records', async () => {
    const before = await UKIPatternStore.size();
    await UKIPatternStore.record('x', ['ctx']);
    const after = await UKIPatternStore.size();
    expect(after.events).toBeGreaterThan(before.events);
  });
});
