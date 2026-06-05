// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { evaluateCondition, evaluateConditions } from '../../src/shared/automation/condition';

describe('automation condition', () => {
  it('evaluates equality and comparison ops', () => {
    expect(evaluateCondition({ field: 'x', op: 'eq', value: 5 }, { x: 5 })).toBe(true);
    expect(evaluateCondition({ field: 'x', op: 'ne', value: 5 }, { x: 5 })).toBe(false);
    expect(evaluateCondition({ field: 'n', op: 'gt', value: 3 }, { n: 5 })).toBe(true);
    expect(evaluateCondition({ field: 'n', op: 'lte', value: 5 }, { n: 5 })).toBe(true);
  });

  it('evaluates string ops', () => {
    expect(evaluateCondition({ field: 'name', op: 'contains', value: 'rail' }, { name: 'trailer' })).toBe(true);
    expect(evaluateCondition({ field: 'f', op: 'endsWith', value: '.mp4' }, { f: 'clip.mp4' })).toBe(true);
    expect(evaluateCondition({ field: 'f', op: 'startsWith', value: 'IMG' }, { f: 'IMG_001' })).toBe(true);
  });

  it('evaluates exists and dotted paths', () => {
    expect(evaluateCondition({ field: 'a', op: 'exists' }, { a: 0 })).toBe(true);
    expect(evaluateCondition({ field: 'a', op: 'exists' }, {})).toBe(false);
    expect(evaluateCondition({ field: 'user.role', op: 'eq', value: 'admin' }, { user: { role: 'admin' } })).toBe(true);
  });

  it('combines with all/any', () => {
    const ctx = { a: 1, b: 2 };
    const conds = [{ field: 'a', op: 'eq' as const, value: 1 }, { field: 'b', op: 'eq' as const, value: 9 }];
    expect(evaluateConditions(conds, ctx, 'all')).toBe(false);
    expect(evaluateConditions(conds, ctx, 'any')).toBe(true);
    expect(evaluateConditions([], ctx)).toBe(true); // no conditions
  });
});
