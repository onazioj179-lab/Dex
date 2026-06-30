// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// IMOSION channel-rack playhead paint.
//
// Perf win: paint the step playhead straight to the DOM from the step clock
// instead of through React state. The rack can have many channels x 16 steps;
// driving the playhead via state would re-render every row 4-8x/sec while a
// pattern plays. Writing `box-shadow` directly on the `[data-rack-step]` cells
// keeps those rows from re-rendering at all. Lives in its own module so the
// paint logic is unit-testable in jsdom without mounting the editor.
// =============================================================================

/** Highlight used on the active step cell. */
export const RACK_PLAYHEAD_SHADOW = 'inset 0 0 0 1px rgba(255,255,255,0.6)';

/**
 * Highlight the channel-rack cells at `step` and clear the rest. Cells opt in
 * via a `data-rack-step="<index>"` attribute. Pass `step < 0` (or any value no
 * cell carries) to clear every cell. No React state is touched, so the rack
 * rows do not re-render while a pattern plays.
 */
export function paintRackPlayhead(step: number): void {
  if (typeof document === 'undefined') return;
  const target = String(step);
  document.querySelectorAll<HTMLElement>('[data-rack-step]').forEach(el => {
    el.style.boxShadow = el.getAttribute('data-rack-step') === target
      ? RACK_PLAYHEAD_SHADOW
      : 'none';
  });
}
