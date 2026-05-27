/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  detectZone,
  rectForZone,
  magnetize,
  isThrow,
  makeEnv,
  type SnapZone,
  type SnapEnvironment,
  type Rect,
} from '../../src/renderer/shell/snapEngine';

const env1080p = makeEnv(1920, 1080);
const envWithSafe = makeEnv(1920, 1080, { top: 40, bottom: 60, left: 0, right: 0 });

describe('detectZone', () => {
  it('returns null in the middle of the screen', () => {
    expect(detectZone(960, 540, env1080p)).toBeNull();
  });

  it('detects full snap at top-center', () => {
    expect(detectZone(960, 5, env1080p)).toBe('full');
  });

  it('detects left snap near left edge', () => {
    expect(detectZone(5, 540, env1080p)).toBe('left');
  });

  it('detects right snap near right edge', () => {
    expect(detectZone(1915, 540, env1080p)).toBe('right');
  });

  it('detects top-left corner', () => {
    expect(detectZone(5, 20, env1080p)).toBe('top-left');
  });

  it('detects top-right corner', () => {
    expect(detectZone(1915, 20, env1080p)).toBe('top-right');
  });

  it('detects bottom-left corner', () => {
    expect(detectZone(5, 1060, env1080p)).toBe('bottom-left');
  });

  it('detects bottom-right corner', () => {
    expect(detectZone(1915, 1060, env1080p)).toBe('bottom-right');
  });

  describe('thirds', () => {
    it('detects left-third at bottom-left', () => {
      expect(detectZone(200, 1075, env1080p, { thirds: true })).toBe('left-third');
    });

    it('detects center-third at bottom-center', () => {
      expect(detectZone(960, 1075, env1080p, { thirds: true })).toBe('center-third');
    });

    it('detects right-third at bottom-right', () => {
      expect(detectZone(1600, 1075, env1080p, { thirds: true })).toBe('right-third');
    });

    it('does not detect thirds without option enabled', () => {
      expect(detectZone(960, 1075, env1080p)).toBeNull();
    });
  });

  describe('stash', () => {
    it('detects stash-left with high velocity at left edge', () => {
      expect(detectZone(3, 540, env1080p, { stashVelocity: 2.0 })).toBe('stash-left');
    });

    it('detects stash-right with high velocity at right edge', () => {
      expect(detectZone(1917, 540, env1080p, { stashVelocity: 2.0 })).toBe('stash-right');
    });

    it('detects stash-bottom with high velocity at bottom edge', () => {
      expect(detectZone(960, 1077, env1080p, { stashVelocity: 2.0 })).toBe('stash-bottom');
    });

    it('does not stash at low velocity', () => {
      expect(detectZone(3, 540, env1080p, { stashVelocity: 1.0 })).toBe('left');
    });
  });

  describe('safe area', () => {
    it('accounts for safe area insets', () => {
      // Pointer at y=5 is now inside the 40px top safe area, so within the adjusted box at y=5 it should be below TOP_FULL_PX
      // We need to test that the safe area shifts detection areas
      const zone = detectZone(960, 45, envWithSafe);
      expect(zone).toBe('full');
    });
  });
});

describe('rectForZone', () => {
  const zones: SnapZone[] = ['full', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'left-third', 'center-third', 'right-third'];

  it.each(zones)('returns a rect for zone "%s"', (zone) => {
    const rect = rectForZone(zone, env1080p);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('full zone covers entire viewport', () => {
    const rect = rectForZone('full', env1080p);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(1920);
    expect(rect.height).toBe(1080);
  });

  it('left half is half the viewport width', () => {
    const rect = rectForZone('left', env1080p);
    expect(rect.width).toBe(960);
    expect(rect.height).toBe(1080);
    expect(rect.x).toBe(0);
  });

  it('right half starts at midpoint', () => {
    const rect = rectForZone('right', env1080p);
    expect(rect.x).toBe(960);
    expect(rect.width).toBe(960);
  });

  it('quarters each occupy 1/4 of viewport', () => {
    for (const zone of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as SnapZone[]) {
      const rect = rectForZone(zone, env1080p);
      expect(rect.width).toBe(960);
      expect(rect.height).toBe(540);
    }
  });

  it('thirds divide viewport into 3 equal columns', () => {
    const third = 1920 / 3;
    expect(rectForZone('left-third', env1080p).width).toBeCloseTo(third, 0);
    expect(rectForZone('center-third', env1080p).x).toBeCloseTo(third, 0);
    expect(rectForZone('right-third', env1080p).x).toBeCloseTo(2 * third, 0);
  });

  it('stash rects are small off-screen slivers', () => {
    const stashLeft = rectForZone('stash-left', env1080p);
    expect(stashLeft.width).toBe(8);
    expect(stashLeft.x).toBeLessThan(0);

    const stashRight = rectForZone('stash-right', env1080p);
    expect(stashRight.x).toBe(1920);

    const stashBottom = rectForZone('stash-bottom', env1080p);
    expect(stashBottom.y).toBe(1080);
  });

  it('respects safe area insets', () => {
    const rect = rectForZone('full', envWithSafe);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(40);
    expect(rect.height).toBe(980);
  });
});

describe('magnetize', () => {
  it('snaps to the right edge of a neighbour', () => {
    const candidate: Rect = { x: 502, y: 100, width: 400, height: 300 };
    const neighbour: Rect = { x: 0, y: 0, width: 500, height: 600 };
    const result = magnetize(candidate, [neighbour]);
    expect(result.x).toBe(500);
  });

  it('snaps to the left edge of a neighbour', () => {
    const candidate: Rect = { x: 396, y: 100, width: 400, height: 300 };
    const neighbour: Rect = { x: 800, y: 0, width: 400, height: 600 };
    const result = magnetize(candidate, [neighbour]);
    expect(result.x).toBe(400);
  });

  it('aligns top edges', () => {
    const candidate: Rect = { x: 100, y: 203, width: 400, height: 300 };
    const neighbour: Rect = { x: 600, y: 200, width: 400, height: 300 };
    const result = magnetize(candidate, [neighbour]);
    expect(result.y).toBe(200);
  });

  it('does not snap beyond tolerance', () => {
    const candidate: Rect = { x: 520, y: 100, width: 400, height: 300 };
    const neighbour: Rect = { x: 0, y: 0, width: 500, height: 600 };
    const result = magnetize(candidate, [neighbour], 6);
    expect(result.x).toBe(520);
  });

  it('handles empty neighbours', () => {
    const candidate: Rect = { x: 100, y: 100, width: 400, height: 300 };
    const result = magnetize(candidate, []);
    expect(result).toEqual(candidate);
  });
});

describe('isThrow', () => {
  it('returns true for distance >= 220px', () => {
    expect(isThrow(220)).toBe(true);
    expect(isThrow(500)).toBe(true);
  });

  it('returns false for distance < 220px', () => {
    expect(isThrow(219)).toBe(false);
    expect(isThrow(0)).toBe(false);
  });
});
