// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Persistent custom snap zones (DEX_FEATURE_BACKLOG 01). Verifies the pure
// geometry: grid construction, bounds conversion, hit-testing, coverage, and the
// expand-across-zones grammar that snap/cycle/expand all build on.
import { describe, it, expect } from 'vitest';
import {
  gridZones,
  zoneToBounds,
  layoutBounds,
  zoneAtPoint,
  coveredZoneIds,
  expandAcross,
  validateZones,
  normalizeZone,
  builtinZoneLayouts,
  type ZoneLayout,
} from '../../src/shared/shell/customZones';

const WS = { x: 0, y: 0, w: 1200, h: 800 };

const grid2x2: ZoneLayout = { id: 't', name: 'Quad', kind: 'grid', zones: gridZones(2, 2) };
const twoCol: ZoneLayout = { id: 't2', name: '2col', kind: 'grid', zones: gridZones(2, 1) };

describe('gridZones', () => {
  it('produces cols*rows non-overlapping zones covering the unit square', () => {
    const zones = gridZones(3, 2);
    expect(zones).toHaveLength(6);
    const area = zones.reduce((a, z) => a + z.w * z.h, 0);
    expect(area).toBeCloseTo(1, 6);
    for (const z of zones) {
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(z.y + z.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('clamps degenerate cols/rows to at least 1', () => {
    expect(gridZones(0, -3)).toHaveLength(1);
  });
});

describe('zoneToBounds / layoutBounds', () => {
  it('insets each zone by the gap and stays inside the workspace', () => {
    const gap = 6;
    const rects = layoutBounds(grid2x2, WS, gap);
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
      expect(r.x).toBeGreaterThanOrEqual(WS.x);
      expect(r.y).toBeGreaterThanOrEqual(WS.y);
      expect(r.x + r.w).toBeLessThanOrEqual(WS.x + WS.w + 1);
      expect(r.y + r.h).toBeLessThanOrEqual(WS.y + WS.h + 1);
    }
  });
  it('top-left quad sits in the top-left of the work area', () => {
    const r = zoneToBounds(grid2x2.zones[0], WS, 6);
    expect(r.x).toBe(6);
    expect(r.y).toBe(6);
    expect(r.w).toBeCloseTo(600 - 12, 0);
    expect(r.h).toBeCloseTo(400 - 12, 0);
  });
});

describe('zoneAtPoint', () => {
  it('hits the zone under the cursor', () => {
    // Bottom-right quad center.
    const z = zoneAtPoint(grid2x2, WS, 900, 600);
    expect(z?.id).toBe(gridZones(2, 2)[3].id);
  });
  it('last-drawn zone wins on overlap (canvas semantics)', () => {
    const layout: ZoneLayout = {
      id: 'o', name: 'overlap', kind: 'canvas',
      zones: [
        { id: 'back', x: 0, y: 0, w: 1, h: 1 },
        { id: 'front', x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      ],
    };
    expect(zoneAtPoint(layout, WS, 600, 400)?.id).toBe('front');
    expect(zoneAtPoint(layout, WS, 10, 10)?.id).toBe('back');
  });
});

describe('coveredZoneIds', () => {
  it('reports exactly the zone a snapped window fills', () => {
    const tl = zoneToBounds(grid2x2.zones[0], WS, 6);
    const ids = coveredZoneIds(tl, grid2x2, WS);
    expect(ids).toEqual([grid2x2.zones[0].id]);
  });
  it('reports both zones a window expanded across covers', () => {
    // A window covering the whole top row of the 2x2 grid.
    const full = { x: 6, y: 6, w: 1188, h: 388 };
    const ids = coveredZoneIds(full, grid2x2, WS);
    expect(ids).toContain(grid2x2.zones[0].id);
    expect(ids).toContain(grid2x2.zones[1].id);
    expect(ids).not.toContain(grid2x2.zones[2].id);
  });
});

describe('expandAcross', () => {
  it('snaps a free window into the nearest zone on first expand', () => {
    // A small window in the top-left corner that covers no zone's center.
    const free = { x: 0, y: 0, w: 60, h: 60 };
    const r = expandAcross(free, grid2x2, WS, 'right');
    // Nearest zone is the top-left; result equals its bounds.
    expect(r).toEqual(zoneToBounds(grid2x2.zones[0], WS, 6));
  });
  it('grows right from top-left to span the whole top row', () => {
    const tl = zoneToBounds(grid2x2.zones[0], WS, 6);
    const r = expandAcross(tl, grid2x2, WS, 'right');
    expect(r).not.toBeNull();
    // Spans both top zones: left edge of top-left, right edge of top-right.
    const tr = zoneToBounds(grid2x2.zones[1], WS, 6);
    expect(r!.x).toBe(tl.x);
    expect(r!.x + r!.w).toBeCloseTo(tr.x + tr.w, 0);
    // Still one row tall.
    expect(r!.h).toBeCloseTo(tl.h, 0);
  });
  it('grows down from top-left to span the left column', () => {
    const tl = zoneToBounds(grid2x2.zones[0], WS, 6);
    const r = expandAcross(tl, grid2x2, WS, 'down');
    const bl = zoneToBounds(grid2x2.zones[2], WS, 6);
    expect(r!.y).toBe(tl.y);
    expect(r!.y + r!.h).toBeCloseTo(bl.y + bl.h, 0);
  });
  it('returns null when there is no zone further in the direction', () => {
    const right = zoneToBounds(twoCol.zones[1], WS, 6);
    expect(expandAcross(right, twoCol, WS, 'right')).toBeNull();
  });
  it('returns null for an empty layout', () => {
    const empty: ZoneLayout = { id: 'e', name: 'e', kind: 'canvas', zones: [] };
    expect(expandAcross({ x: 0, y: 0, w: 100, h: 100 }, empty, WS, 'left')).toBeNull();
  });
});

describe('normalizeZone / validateZones', () => {
  it('clamps an off-canvas zone back into the unit square', () => {
    const z = normalizeZone({ id: 'z', x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
    expect(z.x + z.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(z.y + z.h).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('drops zero/negative zones', () => {
    const kept = validateZones([
      { id: 'ok', x: 0, y: 0, w: 0.5, h: 0.5 },
      { id: 'bad', x: 0, y: 0, w: 0, h: 0.5 },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('ok');
  });
});

describe('builtinZoneLayouts', () => {
  it('every starter layout has valid, in-bounds zones', () => {
    for (const layout of builtinZoneLayouts()) {
      expect(layout.zones.length).toBeGreaterThan(0);
      for (const r of layoutBounds(layout, WS, 6)) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(r.x + r.w).toBeLessThanOrEqual(WS.x + WS.w + 1);
        expect(r.y + r.h).toBeLessThanOrEqual(WS.y + WS.h + 1);
      }
    }
  });
});
