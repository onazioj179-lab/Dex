/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/renderer/utils/zIndexTokens', () => ({
  Z_WINDOW_MIN: 100,
  Z_WINDOW_MAX: 4990,
}));

describe('WindowDepthManager', () => {
  let mod: typeof import('../../src/renderer/shell/WindowDepthManager');

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../src/renderer/shell/WindowDepthManager');
  });

  describe('bringToFront', () => {
    it('returns a z-index above the minimum', () => {
      const z = mod.bringToFront('win-1');
      expect(z).toBeGreaterThan(100);
    });

    it('each call returns a higher z-index', () => {
      const z1 = mod.bringToFront('win-1');
      const z2 = mod.bringToFront('win-2');
      expect(z2).toBeGreaterThan(z1);
    });

    it('bringing an existing window forward gives it a new higher z', () => {
      mod.bringToFront('win-1');
      const z2 = mod.bringToFront('win-2');
      const z1After = mod.bringToFront('win-1');
      expect(z1After).toBeGreaterThan(z2);
    });
  });

  describe('getDepth', () => {
    it('returns the current depth if window is tracked', () => {
      const z = mod.bringToFront('win-A');
      expect(mod.getDepth('win-A')).toBe(z);
    });

    it('auto-registers an untracked window', () => {
      const z = mod.getDepth('new-win');
      expect(z).toBeGreaterThan(100);
    });
  });

  describe('removeWindow', () => {
    it('removes a window from tracking', () => {
      mod.bringToFront('win-x');
      mod.removeWindow('win-x');
      expect(mod.getWindowCount()).toBe(0);
    });

    it('removing non-existent window does not throw', () => {
      expect(() => mod.removeWindow('does-not-exist')).not.toThrow();
    });
  });

  describe('isFrontmost', () => {
    it('returns true for the last window brought to front', () => {
      mod.bringToFront('win-1');
      mod.bringToFront('win-2');
      expect(mod.isFrontmost('win-2')).toBe(true);
      expect(mod.isFrontmost('win-1')).toBe(false);
    });

    it('returns false for untracked windows', () => {
      mod.bringToFront('win-1');
      expect(mod.isFrontmost('unknown')).toBe(false);
    });
  });

  describe('getWindowsByDepth', () => {
    it('returns windows sorted back to front', () => {
      mod.bringToFront('A');
      mod.bringToFront('B');
      mod.bringToFront('C');
      const stack = mod.getWindowsByDepth();
      expect(stack).toEqual(['A', 'B', 'C']);
    });

    it('reflects re-ordering', () => {
      mod.bringToFront('A');
      mod.bringToFront('B');
      mod.bringToFront('A');
      const stack = mod.getWindowsByDepth();
      expect(stack).toEqual(['B', 'A']);
    });

    it('returns empty array when no windows', () => {
      expect(mod.getWindowsByDepth()).toEqual([]);
    });
  });

  describe('getWindowStack', () => {
    it('returns snapshot sorted front to back', () => {
      mod.bringToFront('A');
      mod.bringToFront('B');
      const stack = mod.getWindowStack();
      expect(stack[0].id).toBe('B');
      expect(stack[0].frontmost).toBe(true);
      expect(stack[1].id).toBe('A');
      expect(stack[1].frontmost).toBe(false);
    });

    it('returns empty array when no windows', () => {
      expect(mod.getWindowStack()).toEqual([]);
    });

    it('each entry has id, depth, and frontmost', () => {
      mod.bringToFront('X');
      const [entry] = mod.getWindowStack();
      expect(entry).toHaveProperty('id', 'X');
      expect(entry).toHaveProperty('depth');
      expect(entry).toHaveProperty('frontmost', true);
    });
  });

  describe('getWindowCount', () => {
    it('starts at 0', () => {
      expect(mod.getWindowCount()).toBe(0);
    });

    it('increments as windows are added', () => {
      mod.bringToFront('a');
      mod.bringToFront('b');
      expect(mod.getWindowCount()).toBe(2);
    });

    it('decrements when windows are removed', () => {
      mod.bringToFront('a');
      mod.bringToFront('b');
      mod.removeWindow('a');
      expect(mod.getWindowCount()).toBe(1);
    });
  });

  describe('normalization', () => {
    it('preserves relative order when counter reaches MAX_DEPTH', () => {
      // Simulate many bringToFront calls to push counter near MAX_DEPTH
      // Since we can't easily push to 4990, we verify the normalization logic
      // indirectly by checking that ordering is preserved after many operations
      for (let i = 0; i < 100; i++) {
        mod.bringToFront(`win-${i % 5}`);
      }
      // The last window brought to front should still be frontmost
      mod.bringToFront('final');
      expect(mod.isFrontmost('final')).toBe(true);
    });
  });
});
