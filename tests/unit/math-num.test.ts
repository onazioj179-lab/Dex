import { describe, it, expect } from 'vitest';
import { clamp, lerp, inverseLerp, mapRange, roundTo, mod, approxEqual } from '../../src/shared/math/num';

describe('math num', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('lerp / inverseLerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 2)).toBe(20); // not clamped
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
    expect(inverseLerp(5, 5, 5)).toBe(0); // degenerate
  });

  it('mapRange with optional clamp', () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(15, 0, 10, 0, 100)).toBe(150);
    expect(mapRange(15, 0, 10, 0, 100, true)).toBe(100);
  });

  it('roundTo', () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(2.7)).toBe(3);
    expect(roundTo(1234.5678, 1)).toBe(1234.6);
  });

  it('positive mod and approxEqual', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
    expect(approxEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(approxEqual(1, 2)).toBe(false);
  });
});
