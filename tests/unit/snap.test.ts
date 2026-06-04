import { describe, it, expect } from 'vitest';
import { snapToGrid, nearestSnap, clampRange, snapValue } from '../../src/shared/creative/snap';

describe('snap', () => {
  it('snaps to a grid', () => {
    expect(snapToGrid(7, 5)).toBe(5);
    expect(snapToGrid(8, 5)).toBe(10);
    expect(snapToGrid(5, 0)).toBe(5); // grid<=0 unchanged
  });

  it('snaps to the nearest point within threshold', () => {
    expect(nearestSnap(10, [0, 12, 30], 3)).toEqual({ value: 12, snapped: true, target: 12 });
    expect(nearestSnap(10, [0, 30], 3)).toEqual({ value: 10, snapped: false });
  });

  it('clampRange', () => {
    expect(clampRange(5, 0, 10)).toBe(5);
    expect(clampRange(-1, 0, 10)).toBe(0);
    expect(clampRange(99, 0, 10)).toBe(10);
  });

  it('snapValue prefers a closer point over the grid', () => {
    const r = snapValue(11, { grid: 5, points: [12], threshold: 3 });
    expect(r.value).toBe(12);
    expect(r.snapped).toBe(true);
  });

  it('snapValue falls back to grid when no point is near', () => {
    const r = snapValue(11, { grid: 5, points: [40], threshold: 3 });
    expect(r.value).toBe(10);
  });

  it('snapValue with only a grid', () => {
    expect(snapValue(7, { grid: 5 })).toMatchObject({ value: 5, snapped: true });
  });
});
