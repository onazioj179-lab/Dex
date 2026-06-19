// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Locks the FloatingLauncher clamp fix (v6 P0.1): one symmetric padded bound for
// every path, so a drag-release re-resolve can never shift the orb (the old
// left/right "jump") and the orb can never land off-screen or at a NaN/negative.

import { describe, it, expect } from 'vitest';
import { clampToBounds, clampClusterToBounds, SIZE, GAP, EDGE_PAD } from '../../src/renderer/components/floatingLauncherGeometry';

const VW = 1920;
const VH = 1080;
const maxX = VW - SIZE - EDGE_PAD; // 1856
const maxY = VH - SIZE - EDGE_PAD; // 1016

describe('FloatingLauncher clampToBounds', () => {
  it('leaves an in-bounds position unchanged', () => {
    expect(clampToBounds(100, 200, VW, VH)).toEqual({ x: 100, y: 200 });
  });

  it('pulls a far off-screen (right/bottom) position to the padded max edge', () => {
    expect(clampToBounds(5000, 5000, VW, VH)).toEqual({ x: maxX, y: maxY });
  });

  it('pulls a negative (left/top) position to the padded min edge (EDGE_PAD)', () => {
    expect(clampToBounds(-50, -999, VW, VH)).toEqual({ x: EDGE_PAD, y: EDGE_PAD });
  });

  it('always keeps the orb within [EDGE_PAD, max] on both axes', () => {
    for (const [px, py] of [[-1, -1], [0, 0], [960, 540], [3000, 3000], [maxX, maxY]] as const) {
      const r = clampToBounds(px, py, VW, VH);
      expect(r.x).toBeGreaterThanOrEqual(EDGE_PAD);
      expect(r.x).toBeLessThanOrEqual(maxX);
      expect(r.y).toBeGreaterThanOrEqual(EDGE_PAD);
      expect(r.y).toBeLessThanOrEqual(maxY);
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.y)).toBe(true);
    }
  });

  it('never returns a negative or NaN on a degenerate (near-zero) viewport', () => {
    const r = clampToBounds(100, 100, 10, 10); // viewport smaller than the orb
    expect(r.x).toBe(EDGE_PAD);
    expect(r.y).toBe(EDGE_PAD);
    expect(Number.isNaN(r.x)).toBe(false);
    expect(Number.isNaN(r.y)).toBe(false);
  });

  it('is idempotent — clamping an already-clamped value does not move it (no jump)', () => {
    const once = clampToBounds(5000, 5000, VW, VH);
    const twice = clampToBounds(once.x, once.y, VW, VH);
    expect(twice).toEqual(once);
  });
});

describe('FloatingLauncher clampClusterToBounds (no scatter / no mid-drag flip)', () => {
  // 3-orb cluster: the anchor (bottom) reserves room above for 2 more orbs so the
  // whole upward stack stays on-screen -> anchor y is pinned >= EDGE_PAD + 2*(SIZE+GAP).
  const extentAbove = 2 * (SIZE + GAP); // 106
  const minY = EDGE_PAD + extentAbove;  // 124

  it('keeps the whole 3-orb stack on-screen: anchor never rises above minY', () => {
    // Dragging to the very top should pin the anchor at minY (so the TOP orb,
    // at anchor.y - 2*(SIZE+GAP), lands exactly at EDGE_PAD -- never off-screen).
    const r = clampClusterToBounds(50, 0, VW, VH, 3);
    expect(r.y).toBe(minY);
    expect(r.y - extentAbove).toBe(EDGE_PAD); // top orb exactly at the padded edge
  });

  it('leaves an in-bounds anchor unchanged', () => {
    expect(clampClusterToBounds(200, 400, VW, VH, 3)).toEqual({ x: 200, y: 400 });
  });

  it('pulls a far bottom-right anchor to the padded max edge', () => {
    expect(clampClusterToBounds(9000, 9000, VW, VH, 3)).toEqual({ x: maxX, y: maxY });
  });

  it('is idempotent (a re-resolve after drag never shifts/scatters the cluster)', () => {
    const once = clampClusterToBounds(9000, 0, VW, VH, 3);
    const twice = clampClusterToBounds(once.x, once.y, VW, VH, 3);
    expect(twice).toEqual(once);
  });

  it('reserves less room for a 2-orb cluster than a 3-orb cluster', () => {
    expect(clampClusterToBounds(50, 0, VW, VH, 2).y).toBe(EDGE_PAD + (SIZE + GAP));
    expect(clampClusterToBounds(50, 0, VW, VH, 3).y).toBe(EDGE_PAD + 2 * (SIZE + GAP));
  });
});
