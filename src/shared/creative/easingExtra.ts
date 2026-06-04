// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Extended easing functions (Flux animation, playful UI transitions). Closed-form
 * curves that a single cubic-bezier can't express — bounce, elastic, back. All
 * take and return progress 0..1 (some overshoot intentionally). Pure: no DOM.
 */

export function easeInQuad(x: number): number { return x * x; }
export function easeOutQuad(x: number): number { return 1 - (1 - x) * (1 - x); }
export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** Overshoot-and-settle (anticipation) on the way out. */
export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Springy elastic settle. */
export function easeOutElastic(x: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

/** Classic three-stage bounce. */
export function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) { const t = x - 1.5 / d1; return n1 * t * t + 0.75; }
  if (x < 2.5 / d1) { const t = x - 2.25 / d1; return n1 * t * t + 0.9375; }
  const t = x - 2.625 / d1;
  return n1 * t * t + 0.984375;
}
