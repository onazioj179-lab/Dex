import { describe, it, expect } from 'vitest';
import { cubicBezierPoint, sampleCurve, curveLength } from '../../src/shared/creative/curveSample';

const p0 = { x: 0, y: 0 };
const p1 = { x: 1, y: 0 };
const p2 = { x: 2, y: 0 };
const p3 = { x: 3, y: 0 };

describe('curve sample', () => {
  it('pins endpoints', () => {
    expect(cubicBezierPoint(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicBezierPoint(p0, p1, p2, p3, 1)).toEqual(p3);
  });

  it('evaluates the midpoint of a straight control polygon', () => {
    expect(cubicBezierPoint(p0, p1, p2, p3, 0.5)).toEqual({ x: 1.5, y: 0 });
  });

  it('samples steps+1 points', () => {
    const pts = sampleCurve(p0, p1, p2, p3, 2);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual(p0);
    expect(pts[2]).toEqual(p3);
  });

  it('approximates arc length', () => {
    expect(curveLength(p0, p1, p2, p3, 32)).toBeCloseTo(3, 4);
  });
});
