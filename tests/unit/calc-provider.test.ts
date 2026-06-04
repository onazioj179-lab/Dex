import { describe, it, expect } from 'vitest';
import { evaluateExpression, convertUnit, createCalcProvider } from '../../src/renderer/services/calcProvider';

describe('calc provider', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateExpression('12 * (3 + 4)')).toBe(84);
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('2 ^ 10')).toBe(1024);
    expect(evaluateExpression('10 / 4')).toBe(2.5);
    expect(evaluateExpression('-5 + 3')).toBe(-2);
    expect(evaluateExpression('(1 + 2) * (3 + 4)')).toBe(21);
  });

  it('rejects non-arithmetic and malformed input', () => {
    expect(evaluateExpression('hello')).toBeNull();
    expect(evaluateExpression('2 +')).toBeNull();
    expect(evaluateExpression('(1 + 2')).toBeNull();
    expect(evaluateExpression('')).toBeNull();
  });

  it('converts linear units within a dimension', () => {
    expect(convertUnit(1, 'km', 'm')).toBe(1000);
    expect(convertUnit(1000, 'g', 'kg')).toBe(1);
    expect(Math.round(convertUnit(1, 'mi', 'km')! * 1000) / 1000).toBe(1.609);
    expect(convertUnit(1, 'kg', 'm')).toBeNull(); // cross-dimension
  });

  it('converts temperature (affine)', () => {
    expect(convertUnit(100, 'c', 'f')).toBe(212);
    expect(convertUnit(32, 'f', 'c')).toBe(0);
    expect(convertUnit(0, 'c', 'k')).toBe(273.15);
  });

  it('provider returns an inline calculator result', async () => {
    const p = createCalcProvider();
    const r = await p.search({ text: '12 * (3 + 4)' });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('calculator');
    expect(r[0].title).toBe('84');
  });

  it('provider returns an inline unit conversion', async () => {
    const p = createCalcProvider();
    const r = await p.search({ text: '5 km to mi' });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('unit');
    expect(r[0].title).toMatch(/mi$/);
  });

  it('provider ignores plain text and empty queries', async () => {
    const p = createCalcProvider();
    expect(await p.search({ text: 'prism' })).toHaveLength(0);
    expect(await p.search({ text: '   ' })).toHaveLength(0);
  });
});
