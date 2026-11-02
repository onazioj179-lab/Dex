// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  appendDigit, applyOperator, backspaceEntry, evaluateArithmetic, evaluateNatural,
  formatEntry, formatResult, MAX_ENTRY_DIGITS, parseDisplay,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/calculatorEngine';

describe('calculator arithmetic', () => {
  it('applies the four operators', () => {
    expect(applyOperator(7, '+', 5)).toBe(12);
    expect(applyOperator(7, '-', 5)).toBe(2);
    expect(applyOperator(7, '*', 5)).toBe(35);
    expect(applyOperator(10, '/', 4)).toBe(2.5);
  });

  it('division by zero is an error, not Infinity', () => {
    expect(formatResult(applyOperator(1, '/', 0))).toBe('Error');
    expect(formatResult(applyOperator(0, '/', 0))).toBe('Error');
  });

  it('removes floating-point noise from decimals', () => {
    expect(formatResult(applyOperator(0.1, '+', 0.2))).toBe('0.3');
    expect(formatResult(applyOperator(1.1, '*', 3))).toBe('3.3');
  });

  it('groups thousands and switches to exponent for huge values', () => {
    expect(formatResult(1234567.5)).toBe('1,234,567.5');
    expect(formatResult(1e20)).toBe('1e+20');
    expect(formatResult(-0.5)).toBe('-0.5');
  });
});

describe('calculator entry', () => {
  it('keeps a trailing point and zeros while typing', () => {
    expect(formatEntry('1234.')).toBe('1,234.');
    expect(formatEntry('0.050')).toBe('0.050');
    expect(formatEntry('-1000')).toBe('-1,000');
    expect(parseDisplay('1,234.5')).toBe(1234.5);
  });

  it('caps entry length', () => {
    let raw = '0';
    for (let i = 0; i < 20; i++) raw = appendDigit(raw, '9');
    expect(raw.length).toBe(MAX_ENTRY_DIGITS);
    expect(appendDigit('-0', '4')).toBe('-4');
  });

  it('backspace removes one character and never leaves a bare sign', () => {
    expect(backspaceEntry('0.05')).toBe('0.0');
    expect(backspaceEntry('12')).toBe('1');
    expect(backspaceEntry('5')).toBe('0');
    expect(backspaceEntry('-5')).toBe('0');
    expect(backspaceEntry('Error')).toBe('0');
  });
});

describe('typed expressions (no eval)', () => {
  it('evaluates precedence, powers, functions, constants and percent', () => {
    expect(evaluateArithmetic('2+2*3')).toBe(8);
    expect(evaluateArithmetic('(2+2)*3')).toBe(12);
    expect(evaluateArithmetic('2^3^2')).toBe(512);
    expect(evaluateArithmetic('2**10')).toBe(1024);
    expect(evaluateArithmetic('-3^2')).toBe(-9);
    expect(evaluateArithmetic('sqrt(16)+abs(-2)')).toBe(6);
    expect(evaluateArithmetic('50%')).toBe(0.5);
    expect(evaluateArithmetic('2 × 3 ÷ 4')).toBe(1.5);
    expect(evaluateArithmetic('pi')).toBeCloseTo(Math.PI);
    expect(evaluateArithmetic('1.5e3')).toBe(1500);
  });

  it('rejects code and malformed input', () => {
    expect(evaluateArithmetic('constructor')).toBeNull();
    expect(evaluateArithmetic('Math.constructor')).toBeNull();
    expect(evaluateArithmetic('alert(1)')).toBeNull();
    expect(evaluateArithmetic('2+')).toBeNull();
    expect(evaluateArithmetic('(1+2')).toBeNull();
    expect(evaluateArithmetic('1/0')).toBeNull();
    expect(evaluateArithmetic('')).toBeNull();
  });

  it('handles units and "percent of"', () => {
    expect(evaluateNatural('20% of 80')?.value).toBe(16);
    expect(evaluateNatural('100 c in f')?.value).toBe(212);
    expect(evaluateNatural('1 km to m')?.value).toBe(1000);
    expect(evaluateNatural('1 kg to m')).toBeNull();
  });
});
