// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for AXL's parametric expression evaluator (utils/exprEval):
 * arithmetic precedence, right-assoc power, unary minus, parameters,
 * functions, error paths, and the fixed-point parameter-table resolver
 * (chained references + circular detection).
 */
import { describe, it, expect } from 'vitest';
import { evaluateExpression, resolveParameters } from '../../src/renderer/DEXAPPLICATIONS/axl/utils/exprEval';

describe('evaluateExpression', () => {
  it('handles precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('10 - 4 - 3')).toBe(3); // left-assoc
    expect(evaluateExpression('20 / 4 / 5')).toBe(1);
    expect(evaluateExpression('7 % 4')).toBe(3);
  });

  it('power is right-associative and binds tighter than *', () => {
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512);
    expect(evaluateExpression('2 * 3 ^ 2')).toBe(18);
  });

  it('unary minus', () => {
    expect(evaluateExpression('-5 + 3')).toBe(-2);
    expect(evaluateExpression('2 * -3')).toBe(-6);
    expect(evaluateExpression('-(2 + 3)')).toBe(-5);
  });

  it('resolves parameters and pi', () => {
    expect(evaluateExpression('width * 2', { width: 21 })).toBe(42);
    expect(evaluateExpression('pi * r ^ 2', { r: 2 })).toBeCloseTo(Math.PI * 4, 10);
  });

  it('functions: sqrt/abs/min/max/floor/ceil/round', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('abs(-7)')).toBe(7);
    expect(evaluateExpression('min(3, 8, 1)')).toBe(1);
    expect(evaluateExpression('max(3, 8, 1)')).toBe(8);
    expect(evaluateExpression('floor(2.9) + ceil(2.1) + round(2.5)')).toBe(2 + 3 + 3);
  });

  it('throws readable errors', () => {
    expect(() => evaluateExpression('')).toThrow(/Empty/);
    expect(() => evaluateExpression('2 +')).toThrow();
    expect(() => evaluateExpression('foo + 1')).toThrow(/Unknown parameter "foo"/);
    expect(() => evaluateExpression('nope(3)')).toThrow(/Unknown function "nope"/);
    expect(() => evaluateExpression('1 / 0')).toThrow(/Division by zero/);
    expect(() => evaluateExpression('(1 + 2')).toThrow(/Missing "\)"/);
    expect(() => evaluateExpression('2 3')).toThrow(/trailing/i);
    expect(() => evaluateExpression('2 @ 3')).toThrow(/Unexpected character/);
  });
});

describe('resolveParameters', () => {
  it('resolves chained references regardless of declaration order', () => {
    const out = resolveParameters([
      { name: 'depth', value: 0, expression: 'width * 2' },
      { name: 'width', value: 0, expression: 'base + 10' },
      { name: 'base', value: 40 },
    ]);
    const byName = Object.fromEntries(out.map(p => [p.name, p.value]));
    expect(byName.base).toBe(40);
    expect(byName.width).toBe(50);
    expect(byName.depth).toBe(100);
  });

  it('leaves plain-value parameters untouched', () => {
    const out = resolveParameters([{ name: 'a', value: 7 }]);
    expect(out[0].value).toBe(7);
  });

  it('throws on circular references', () => {
    expect(() => resolveParameters([
      { name: 'a', value: 1, expression: 'b + 1' },
      { name: 'b', value: 1, expression: 'a + 1' },
    ])).toThrow(/Circular/);
  });
});
