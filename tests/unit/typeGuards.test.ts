// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  isString, isNumber, isBoolean, isNullish, isNonNullish,
  isFiniteNumber, isPositiveInteger, isNonNegativeInteger,
  isObject, isArray, arrayOf, recordOf, maybe, nullable,
  and, or, literal, oneOf, hasKeys, shapeOf,
  isSerializedError, isISODateString, isFilePath, isHexColor,
} from '../../src/shared/typeGuards';

describe('primitive guards', () => {
  it('isString', () => { expect(isString('')).toBe(true); expect(isString(1)).toBe(false); });
  it('isNumber rejects NaN', () => { expect(isNumber(NaN)).toBe(false); expect(isNumber(1)).toBe(true); });
  it('isBoolean', () => { expect(isBoolean(true)).toBe(true); expect(isBoolean(0)).toBe(false); });
  it('isNullish', () => { expect(isNullish(null)).toBe(true); expect(isNullish(undefined)).toBe(true); expect(isNullish(0)).toBe(false); });
  it('isNonNullish', () => { expect(isNonNullish(null)).toBe(false); expect(isNonNullish(0)).toBe(true); });
  it('isFiniteNumber', () => { expect(isFiniteNumber(Infinity)).toBe(false); expect(isFiniteNumber(1.5)).toBe(true); });
  it('isPositiveInteger', () => { expect(isPositiveInteger(0)).toBe(false); expect(isPositiveInteger(1)).toBe(true); });
  it('isNonNegativeInteger', () => { expect(isNonNegativeInteger(0)).toBe(true); expect(isNonNegativeInteger(-1)).toBe(false); });
});

describe('structural guards', () => {
  it('isObject rejects arrays', () => { expect(isObject([])).toBe(false); expect(isObject({})).toBe(true); });
  it('isArray', () => { expect(isArray([])).toBe(true); expect(isArray({})).toBe(false); });
});

describe('combinators', () => {
  it('arrayOf', () => {
    expect(arrayOf(isString)(['a', 'b'])).toBe(true);
    expect(arrayOf(isString)(['a', 1])).toBe(false);
  });

  it('recordOf', () => {
    expect(recordOf(isNumber)({ a: 1, b: 2 })).toBe(true);
    expect(recordOf(isNumber)({ a: 1, b: 'x' })).toBe(false);
  });

  it('maybe allows undefined', () => {
    expect(maybe(isString)(undefined)).toBe(true);
    expect(maybe(isString)('x')).toBe(true);
    expect(maybe(isString)(1)).toBe(false);
  });

  it('nullable allows null', () => {
    expect(nullable(isString)(null)).toBe(true);
    expect(nullable(isString)('x')).toBe(true);
    expect(nullable(isString)(1)).toBe(false);
  });

  it('literal', () => {
    const isHello = literal('hello' as const);
    expect(isHello('hello')).toBe(true);
    expect(isHello('world')).toBe(false);
  });

  it('oneOf', () => {
    const isAorB = oneOf('a', 'b');
    expect(isAorB('a')).toBe(true);
    expect(isAorB('c')).toBe(false);
  });

  it('and combines guards strictly', () => {
    const isPlainObj = and(isObject, (v): v is { n: number } => typeof (v as any).n === 'number');
    expect(isPlainObj({ n: 5 })).toBe(true);
    expect(isPlainObj({ n: 'x' })).toBe(false);
  });

  it('or accepts either', () => {
    const isStrOrNum = or(isString, isNumber);
    expect(isStrOrNum('x')).toBe(true);
    expect(isStrOrNum(1)).toBe(true);
    expect(isStrOrNum(true)).toBe(false);
  });
});

describe('structural shape', () => {
  it('hasKeys', () => {
    expect(hasKeys({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
    expect(hasKeys({ a: 1 }, ['a', 'b'])).toBe(false);
  });

  it('shapeOf', () => {
    const isUser = shapeOf<{ name: string; age: number }>({ name: isString, age: isNumber });
    expect(isUser({ name: 'T', age: 30 })).toBe(true);
    expect(isUser({ name: 'T' })).toBe(false);
  });
});

describe('DEX-specific guards', () => {
  it('isSerializedError', () => {
    expect(isSerializedError({ code: 'E', message: 'm' })).toBe(true);
    expect(isSerializedError({ code: 'E' })).toBe(false);
  });

  it('isISODateString', () => {
    expect(isISODateString(new Date().toISOString())).toBe(true);
    expect(isISODateString('not-a-date')).toBe(false);
  });

  it('isFilePath rejects empty', () => {
    expect(isFilePath('/some/path')).toBe(true);
    expect(isFilePath('')).toBe(false);
  });

  it('isHexColor', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#abcdef')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});
