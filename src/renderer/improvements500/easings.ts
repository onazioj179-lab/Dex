// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Curated easing functions for animations and transitions.
 * Inputs are clamped to [0, 1]; outputs are in [0, 1] (except elastic /
 * back which slightly overshoot, by design).
 */

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export const easings = {
  linear: (t: number): number => clamp01(t),
  easeInQuad: (t: number): number => { t = clamp01(t); return t * t; },
  easeOutQuad: (t: number): number => { t = clamp01(t); return t * (2 - t); },
  easeInOutQuad: (t: number): number => { t = clamp01(t); return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
  easeInCubic: (t: number): number => { t = clamp01(t); return t * t * t; },
  easeOutCubic: (t: number): number => { t = clamp01(t); const u = t - 1; return u * u * u + 1; },
  easeInOutCubic: (t: number): number => {
    t = clamp01(t);
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  },
  easeOutBack: (t: number): number => {
    t = clamp01(t);
    const c1 = 1.70158, c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  },
  easeOutElastic: (t: number): number => {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: (t: number): number => {
    t = clamp01(t);
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  },
} as const;

export type EasingName = keyof typeof easings;
