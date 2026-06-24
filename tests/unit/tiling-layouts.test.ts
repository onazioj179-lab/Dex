// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Selectable tiling layouts (DEX_FEATURE_BACKLOG P1). Verifies the pure geometry:
// correct tile count, tiles stay inside the workspace, no negatives, and each
// strategy has its defining shape.
import { describe, it, expect } from 'vitest';
import {
  computeTiling,
  TILING_LAYOUTS,
  tilingLayoutLabel,
  type TilingLayout,
} from '../../src/shared/shell/tilingLayouts';

const WS = { x: 0, y: 0, w: 1200, h: 800 };
const GAP = 6;

function within(r: { x: number; y: number; w: number; h: number }) {
  return r.x >= WS.x && r.y >= WS.y && r.x + r.w <= WS.x + WS.w + 1 && r.y + r.h <= WS.y + WS.h + 1;
}
function noNegatives(r: { w: number; h: number }) {
  return r.w > 0 && r.h > 0;
}

describe('computeTiling — invariants across every layout', () => {
  for (const layout of TILING_LAYOUTS) {
    it(`${layout}: returns exactly N rects, all inside the workspace with positive size`, () => {
      for (const count of [1, 2, 3, 4, 5, 7]) {
        const rects = computeTiling(layout, count, WS, { gap: GAP });
        expect(rects).toHaveLength(count);
        for (const r of rects) {
          expect(noNegatives(r)).toBe(true);
          expect(within(r)).toBe(true);
        }
      }
    });
  }

  it('count 0 yields no rects', () => {
    expect(computeTiling('grid', 0, WS)).toEqual([]);
  });

  it('a single window fills the gapped inner area in every layout', () => {
    for (const layout of TILING_LAYOUTS) {
      const [r] = computeTiling(layout, 1, WS, { gap: GAP });
      expect(r).toEqual({ x: GAP, y: GAP, w: WS.w - GAP * 2, h: WS.h - GAP * 2 });
    }
  });
});

describe('computeTiling — per-strategy shape', () => {
  it('columns: equal full-height side-by-side panes', () => {
    const rects = computeTiling('columns', 3, WS, { gap: GAP });
    const h = rects[0].h;
    expect(rects.every((r) => r.h === h)).toBe(true);            // full height each
    expect(rects[0].x).toBeLessThan(rects[1].x);                 // ordered L→R
    expect(rects[1].x).toBeLessThan(rects[2].x);
    // widths + gaps reconstruct the inner area width
    const sumW = rects.reduce((s, r) => s + r.w, 0) + GAP * (rects.length - 1);
    expect(sumW).toBe(WS.w - GAP * 2);
  });

  it('rows: equal full-width stacked panes', () => {
    const rects = computeTiling('rows', 3, WS, { gap: GAP });
    const w = rects[0].w;
    expect(rects.every((r) => r.w === w)).toBe(true);
    expect(rects[0].y).toBeLessThan(rects[1].y);
  });

  it('master: a wide left pane + a stacked right column', () => {
    const rects = computeTiling('master', 3, WS, { gap: GAP, masterRatio: 0.6 });
    const [master, s1, s2] = rects;
    expect(master.h).toBe(WS.h - GAP * 2);                       // full-height master
    expect(master.w).toBeGreaterThan(s1.w);                      // master wider than stack
    expect(s1.x).toBe(s2.x);                                     // stack shares a column
    expect(s1.y).toBeLessThan(s2.y);                             // stacked vertically
    expect(Math.abs(master.w / (WS.w - GAP * 2) - 0.6)).toBeLessThan(0.02);
  });

  it('monocle: every window fills the same full area', () => {
    const rects = computeTiling('monocle', 4, WS, { gap: GAP });
    expect(new Set(rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`)).size).toBe(1);
  });

  it('grid: uses a near-square column count', () => {
    const rects = computeTiling('grid', 4, WS, { gap: GAP }); // 2x2
    const xs = new Set(rects.map((r) => r.x));
    expect(xs.size).toBe(2);
  });

  it('dwindle: tiles do not overlap (areas sum to <= the inner area)', () => {
    const rects = computeTiling('dwindle', 4, WS, { gap: GAP });
    const sumArea = rects.reduce((s, r) => s + r.w * r.h, 0);
    const innerArea = (WS.w - GAP * 2) * (WS.h - GAP * 2);
    expect(sumArea).toBeLessThanOrEqual(innerArea);
  });
});

describe('tiling metadata', () => {
  it('labels every layout', () => {
    for (const l of TILING_LAYOUTS) expect(tilingLayoutLabel(l as TilingLayout).length).toBeGreaterThan(0);
    expect(TILING_LAYOUTS).toContain('master');
    expect(TILING_LAYOUTS).toContain('monocle');
  });
});
