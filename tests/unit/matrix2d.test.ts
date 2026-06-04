import { describe, it, expect } from 'vitest';
import {
  identity, translate, scale, rotate, multiply, compose,
  applyToPoint, determinant, invert, toCss,
} from '../../src/shared/creative/matrix2d';

describe('matrix2d', () => {
  it('identity / translate / scale apply correctly', () => {
    expect(applyToPoint(identity(), { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
    expect(applyToPoint(translate(10, 20), { x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
    expect(applyToPoint(scale(2), { x: 3, y: 4 })).toEqual({ x: 6, y: 8 });
  });

  it('rotates 90° about the origin', () => {
    const p = applyToPoint(rotate(Math.PI / 2), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1, 6);
  });

  it('composes left-to-right (apply first arg first)', () => {
    // translate then scale: (0,0)->(10,0)->(20,0)
    const m = compose(translate(10, 0), scale(2));
    expect(applyToPoint(m, { x: 0, y: 0 })).toEqual({ x: 20, y: 0 });
  });

  it('multiply order: m2 applied first', () => {
    const m = multiply(scale(2), translate(10, 0));
    expect(applyToPoint(m, { x: 0, y: 0 })).toEqual({ x: 20, y: 0 });
  });

  it('determinant and invert round-trip', () => {
    expect(determinant(scale(2, 3))).toBe(6);
    const inv = invert(scale(2))!;
    expect(applyToPoint(inv, { x: 6, y: 8 })).toEqual({ x: 3, y: 4 });

    const m = compose(translate(5, 3), rotate(0.5), scale(2));
    const back = invert(m)!;
    const r = applyToPoint(back, applyToPoint(m, { x: 7, y: -2 }));
    expect(r.x).toBeCloseTo(7, 6);
    expect(r.y).toBeCloseTo(-2, 6);
  });

  it('returns null for a singular matrix', () => {
    expect(invert(scale(0))).toBeNull();
  });

  it('serializes to CSS', () => {
    expect(toCss(identity())).toBe('matrix(1, 0, 0, 1, 0, 0)');
  });
});
