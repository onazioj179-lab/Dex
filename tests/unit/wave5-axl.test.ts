import { describe, it, expect } from 'vitest';
import { solve, type Constraint, type Point2D } from '../../src/shared/cad/constraintSolver';
import { dofCount, transformOf, identity, type JointSpec } from '../../src/shared/cad/joints';

describe('Wave 5 — Axl CAD depth', () => {
  describe('constraint solver', () => {
    it('coincident pulls two points together', () => {
      const points: Point2D[] = [{ x: 0, y: 0 }, { x: 10, y: 5 }];
      const constraints: Constraint[] = [{ kind: 'coincident', a: 0, b: 1 }];
      const r = solve(points, constraints, { maxIters: 200 });
      expect(r.converged).toBe(true);
      expect(Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y)).toBeLessThan(1e-3);
    });
    it('distance constraint enforces target distance', () => {
      const points: Point2D[] = [{ x: 0, y: 0, fixed: true }, { x: 10, y: 0 }];
      const constraints: Constraint[] = [{ kind: 'distance', a: 0, b: 1, d: 5 }];
      const r = solve(points, constraints);
      expect(r.converged).toBe(true);
      expect(Math.hypot(points[1]!.x, points[1]!.y)).toBeCloseTo(5, 2);
    });
    it('horizontal aligns y values', () => {
      const points: Point2D[] = [{ x: 0, y: 0, fixed: true }, { x: 5, y: 3 }];
      const constraints: Constraint[] = [{ kind: 'horizontal', a: 0, b: 1 }];
      const r = solve(points, constraints);
      expect(r.converged).toBe(true);
      expect(points[1]!.y).toBeCloseTo(0, 3);
    });
    it('fixed points stay put', () => {
      const points: Point2D[] = [{ x: 7, y: 3, fixed: true }];
      const constraints: Constraint[] = [{ kind: 'fix-x', a: 0, x: 0 }];
      solve(points, constraints);
      expect(points[0]!.x).toBe(7);
      expect(points[0]!.y).toBe(3);
    });
  });

  describe('joints', () => {
    it('reports correct DOF counts', () => {
      expect(dofCount('rigid')).toBe(0);
      expect(dofCount('revolute')).toBe(1);
      expect(dofCount('prismatic')).toBe(1);
      expect(dofCount('cylindrical')).toBe(2);
      expect(dofCount('ball')).toBe(3);
      expect(dofCount('planar')).toBe(3);
    });
    it('rigid joint at origin produces identity-like transform', () => {
      const spec: JointSpec = { id: 'j', kind: 'rigid', origin: [0,0,0], parent: 'p', child: 'c' };
      const m = transformOf(spec, { values: [] });
      const id = identity();
      for (let i = 0; i < 16; i++) expect(m[i]).toBeCloseTo(id[i]!, 5);
    });
    it('prismatic joint translates along axis', () => {
      const spec: JointSpec = {
        id: 'j', kind: 'prismatic', origin: [0,0,0],
        axis: [1, 0, 0], parent: 'p', child: 'c',
      };
      const m = transformOf(spec, { values: [5] });
      expect(m[12]).toBeCloseTo(5, 5);
    });
  });
});
