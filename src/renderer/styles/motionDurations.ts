// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// THE motion durations (owner-specified ranges): feedback 80-120 · hover/press
// 120-180 · standard 180-260 · panel 220-320 · major 280-420 ms. Mirrors the
// --duration-* tokens in design-system.css. Runtime writers (TierManager,
// Settings) used to set their own conflicting values inline (400 ms "slow",
// 250 ms, 80 ms...), which silently overrode the stylesheet; they now all go
// through applyMotionDurations().
//

export const MOTION_MS = {
  fast: 100,   // immediate feedback
  normal: 150, // hover / press
  slow: 220,   // standard transition
  panel: 260,  // panels, sheets, drawers
  major: 340,  // major layout / workspace changes
  theme: 150,  // theme cross-fade
} as const;

/**
 * Write the duration tokens on <html>. `reduce` zeroes them (reduced motion);
 * otherwise `scale` (performance tier, 1 = full) shortens them proportionally.
 */
export function applyMotionDurations(root: HTMLElement, opts: { reduce: boolean; scale?: number }): void {
  const scale = opts.scale ?? 1;
  for (const [name, ms] of Object.entries(MOTION_MS)) {
    root.style.setProperty(`--duration-${name}`, opts.reduce ? '0ms' : `${Math.round(ms * scale)}ms`);
  }
}
