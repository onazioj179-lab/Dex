// =============================================================================
// AXL Sketch geometry — unit tests for the 2D-profile -> 3D-solid core.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  profileFromEntities, triangulate, extrudeSketch, revolveSketch,
  snapSketchPoint, type SketchEnt,
} from '../../src/renderer/DEXAPPLICATIONS/axl/AxlSketch';

const rect = (): SketchEnt[] => [{ kind: 'rect', x0: -30, y0: -20, x1: 30, y1: 20 }];
const circle = (): SketchEnt[] => [{ kind: 'circle', cx: 0, cy: 0, r: 25 }];
const triLines = (): SketchEnt[] => [
  { kind: 'line', x0: 0, y0: 0, x1: 40, y1: 0 },
  { kind: 'line', x0: 40, y0: 0, x1: 20, y1: 40 },
  { kind: 'line', x0: 20, y0: 40, x1: 0, y1: 0 },
];

describe('profileFromEntities', () => {
  it('returns 4 corners for a rectangle', () => {
    const loop = profileFromEntities(rect());
    expect(loop).not.toBeNull();
    expect(loop!.length).toBe(4);
  });
  it('samples a circle into a polygon loop', () => {
    const loop = profileFromEntities(circle());
    expect(loop!.length).toBeGreaterThanOrEqual(24);
  });
  it('chains 3 lines into a closed triangle loop', () => {
    const loop = profileFromEntities(triLines());
    expect(loop).not.toBeNull();
    expect(loop!.length).toBe(3);
  });
  it('returns null when there is no closeable profile', () => {
    expect(profileFromEntities([{ kind: 'line', x0: 0, y0: 0, x1: 10, y1: 0 }])).toBeNull();
  });
});

describe('triangulate (ear clipping)', () => {
  it('triangulates a quad into 2 triangles', () => {
    const tris = triangulate([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(tris.length).toBe(2);
  });
  it('triangulates an n-gon into n-2 triangles', () => {
    const pent = [{ x: 0, y: 2 }, { x: 2, y: 0 }, { x: 1, y: -2 }, { x: -1, y: -2 }, { x: -2, y: 0 }];
    expect(triangulate(pent).length).toBe(3);
  });
  it('handles clockwise input (reversed winding)', () => {
    const cw = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
    expect(triangulate(cw).length).toBe(2);
  });
});

describe('extrudeSketch', () => {
  it('produces a watertight-ish box mesh from a rectangle', () => {
    const mesh = extrudeSketch(rect(), 40)!;
    expect(mesh).not.toBeNull();
    // 2 caps (2 tris each) + 4 walls (2 tris each) = 12 tris = 36 indices.
    expect(mesh.indices.length).toBe(36);
    // positions and normals are parallel flat arrays.
    expect(mesh.positions.length).toBe(mesh.normals.length);
    expect(mesh.positions.length % 3).toBe(0);
    // extruded to +/-20 in Z.
    const zs = mesh.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(20, 5);
    expect(Math.min(...zs)).toBeCloseTo(-20, 5);
  });
  it('recentres the profile on the origin', () => {
    const mesh = extrudeSketch([{ kind: 'rect', x0: 100, y0: 100, x1: 160, y1: 140 }], 10)!;
    const xs = mesh.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(30, 4);
    expect(Math.min(...xs)).toBeCloseTo(-30, 4);
  });
  it('returns null for an unclosable profile', () => {
    expect(extrudeSketch([{ kind: 'line', x0: 0, y0: 0, x1: 5, y1: 0 }], 10)).toBeNull();
  });
});

describe('revolveSketch', () => {
  it('produces a non-empty surface of revolution', () => {
    const mesh = revolveSketch(rect(), 360)!;
    expect(mesh).not.toBeNull();
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);
  });
});

describe('snapSketchPoint', () => {
  it('snaps to the grid', () => {
    expect(snapSketchPoint({ x: 11, y: -7 }, 10, [])).toEqual({ x: 10, y: -10 });
  });
  it('snaps to a nearby endpoint over the grid', () => {
    const ents: SketchEnt[] = [{ kind: 'line', x0: 23, y0: 23, x1: 50, y1: 50 }];
    expect(snapSketchPoint({ x: 25, y: 25 }, 10, ents)).toEqual({ x: 23, y: 23 });
  });
});
