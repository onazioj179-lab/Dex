import { describe, it, expect } from 'vitest';
import { insetRect, safeAreas, pointInRect } from '../../src/shared/creative/safeArea';

describe('safe area', () => {
  it('computes a centered inset rect', () => {
    expect(insetRect(100, 100, 0.9)).toEqual({ x: 5, y: 5, width: 90, height: 90 });
  });

  it('computes action-safe (90%) and title-safe (80%) for 1080p', () => {
    const s = safeAreas(1920, 1080);
    expect(s.action).toEqual({ x: 96, y: 54, width: 1728, height: 972 });
    expect(s.title).toEqual({ x: 192, y: 108, width: 1536, height: 864 });
  });

  it('point-in-rect test', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(pointInRect(50, 50, r)).toBe(true);
    expect(pointInRect(150, 50, r)).toBe(false);
    expect(pointInRect(0, 0, r)).toBe(true); // inclusive
  });
});
