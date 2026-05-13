// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Easing functions used for UI animation curves. All take t in [0, 1].
 *
 * @internal DEX module - DEX is a closed-source product. Do not redistribute.
 */
export function easeInQuad(t: number): number { return t * t; }
export function easeOutQuad(t: number): number { return 1 - (1 - t) * (1 - t); }
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}
export function easeInCubic(t: number): number { return t * t * t; }
export function easeOutCubic(t: number): number { const u = 1 - t; return 1 - u * u * u; }
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) ** 3;
}
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c = overshoot + 1;
  const u = t - 1;
  return 1 + c * u * u * u + overshoot * u * u;
}
export function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
export function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { const u = t - 1.5 / d1; return n1 * u * u + 0.75; }
  if (t < 2.5 / d1) { const u = t - 2.25 / d1; return n1 * u * u + 0.9375; }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
}
