import { describe, it, expect } from 'vitest';
import { cubicBezier, easeAt } from '../../src/shared/creative/bezier';

describe('cubic bezier easing', () => {
  it('linear curve is identity', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(linear(x)).toBeCloseTo(x, 6);
    }
  });

  it('pins endpoints to 0 and 1', () => {
    expect(easeAt(0, 0.25, 0.1, 0.25, 1)).toBe(0);
    expect(easeAt(1, 0.25, 0.1, 0.25, 1)).toBe(1);
    expect(easeAt(-0.5, 0.42, 0, 0.58, 1)).toBe(0);
    expect(easeAt(2, 0.42, 0, 0.58, 1)).toBe(1);
  });

  it('ease-in-out is symmetric at the midpoint', () => {
    expect(easeAt(0.5, 0.42, 0, 0.58, 1)).toBeCloseTo(0.5, 3);
  });

  it('ease-out rises faster than linear early', () => {
    // cubic-bezier(0, 0, 0.58, 1) ("ease-out"): y > x for 0<x<1
    const easeOut = cubicBezier(0, 0, 0.58, 1);
    expect(easeOut(0.25)).toBeGreaterThan(0.25);
  });

  it('is monotonic non-decreasing', () => {
    const e = cubicBezier(0.25, 0.1, 0.25, 1);
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.1) {
      const y = e(Math.min(1, x));
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });
});
