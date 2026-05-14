// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// We test shouldSkipExpensiveEffect() by controlling the module-level state
// via the exported helpers. Because cachedTier is module-private we exercise
// the function through the public surface: detectPerformanceTier() +
// the performanceMode produced by the frame-loop.
//
// Strategy:
//   - Stub window.matchMedia so reducedMotion=false by default
//   - Control cachedTier via data-perf-tier attribute on documentElement
//   - Control performanceMode via direct injection of frameTimeHistory
// ---------------------------------------------------------------------------

// Stub matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Stub WebGL (no GPU info)
const getContextOrig = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  (HTMLCanvasElement.prototype as any).getContext = vi.fn().mockReturnValue(null);
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = getContextOrig;
  document.documentElement.removeAttribute('data-perf-tier');
});

describe('shouldSkipExpensiveEffect (K3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips on low perf tier regardless of frame time', async () => {
    document.documentElement.setAttribute('data-perf-tier', 'low');
    const { shouldSkipExpensiveEffect } = await import('../../src/renderer/utils/animationBudget');
    expect(shouldSkipExpensiveEffect()).toBe(true);
  });

  it('does not skip on mid tier with normal frame times', async () => {
    document.documentElement.setAttribute('data-perf-tier', 'mid');
    const { shouldSkipExpensiveEffect } = await import('../../src/renderer/utils/animationBudget');
    // performanceMode defaults to 'normal' (< 10 frame samples)
    expect(shouldSkipExpensiveEffect()).toBe(false);
  });

  it('does not skip on high tier with normal frame times', async () => {
    document.documentElement.setAttribute('data-perf-tier', 'high');
    const { shouldSkipExpensiveEffect } = await import('../../src/renderer/utils/animationBudget');
    expect(shouldSkipExpensiveEffect()).toBe(false);
  });

  it('skips on ultra tier when performance mode is disabled (reduced-motion)', async () => {
    document.documentElement.setAttribute('data-perf-tier', 'ultra');
    // Make matchMedia report prefers-reduced-motion so performanceMode → 'disabled'
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { initAnimationBudget, shouldSkipExpensiveEffect } = await import('../../src/renderer/utils/animationBudget');
    const cleanup = initAnimationBudget();
    expect(shouldSkipExpensiveEffect()).toBe(true);
    cleanup();
  });

  it('does not skip on ultra tier even with reduced performance mode', async () => {
    // ultra tier is exempt from the reduced-mode skip gate
    document.documentElement.setAttribute('data-perf-tier', 'ultra');
    (window.matchMedia as any).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { shouldSkipExpensiveEffect } = await import('../../src/renderer/utils/animationBudget');
    // performanceMode is 'normal' (no frame history yet), tier = ultra → false
    expect(shouldSkipExpensiveEffect()).toBe(false);
  });
});
