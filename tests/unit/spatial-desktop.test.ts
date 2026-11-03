// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Spatial desktop: camera math (no drift), fitting, culling, arrangements, and
// the store's host bridge, groups and corrupt-state repair.
//
import { describe, it, expect, beforeEach } from 'vitest';
import {
  zoomAt, panBy, screenToWorld, worldToScreen, fitRect, isOnScreen, sanitizeCamera,
  arrange, placeNewWindow, lerpCamera, clampZoom, DEFAULT_LIMITS, type Rect,
} from '../../src/renderer/shell/spatial/spatialMath';
import { useSpatialStore, type SpatialWindow } from '../../src/renderer/store/spatialStore';

describe('spatial camera math', () => {
  it('keeps the world point under the cursor fixed while zooming', () => {
    const cam = { x: 120, y: -40, z: 1 };
    const before = screenToWorld(cam, 300, 200);
    const after = zoomAt(cam, 300, 200, 1.7);
    const p = screenToWorld(after, 300, 200);
    expect(p.x).toBeCloseTo(before.x, 9);
    expect(p.y).toBeCloseTo(before.y, 9);
  });

  it('does not drift over a thousand zoom/pan round trips', () => {
    let cam = { x: 5000, y: -3000, z: 1 };
    for (let i = 0; i < 1000; i++) {
      cam = zoomAt(cam, 640, 360, 1.13);
      cam = panBy(cam, 37, -11);
      cam = panBy(cam, -37, 11);
      cam = zoomAt(cam, 640, 360, 1 / 1.13);
    }
    expect(cam.z).toBeCloseTo(1, 9);
    expect(cam.x).toBeCloseTo(5000, 6);
    expect(cam.y).toBeCloseTo(-3000, 6);
  });

  it('round-trips screen <-> world', () => {
    const cam = { x: -900, y: 410, z: 0.37 };
    const s = worldToScreen(cam, 12, 34);
    const w = screenToWorld(cam, s.x, s.y);
    expect(w.x).toBeCloseTo(12, 9);
    expect(w.y).toBeCloseTo(34, 9);
  });

  it('clamps zoom to 5%..300% and repairs corrupt cameras', () => {
    expect(clampZoom(0.001)).toBe(DEFAULT_LIMITS.min);
    expect(clampZoom(99)).toBe(DEFAULT_LIMITS.max);
    expect(sanitizeCamera({ x: NaN, y: 'a', z: Infinity })).toEqual({ x: 0, y: 0, z: 1 });
    expect(sanitizeCamera(null)).toEqual({ x: 0, y: 0, z: 1 });
    expect(sanitizeCamera({ x: 1e12, y: -1e12, z: 2 }).x).toBe(1_000_000);
  });

  it('fits a rect inside the viewport, centred, never above 100%', () => {
    const r: Rect = { x: 1000, y: 1000, w: 4000, h: 1000 };
    const cam = fitRect(r, 1280, 720, 48);
    const tl = worldToScreen(cam, r.x, r.y);
    const br = worldToScreen(cam, r.x + r.w, r.y + r.h);
    expect(tl.x).toBeGreaterThanOrEqual(47.9);
    expect(br.x).toBeLessThanOrEqual(1280 - 47.9);
    expect((tl.y + br.y) / 2).toBeCloseTo(360, 6);
    expect(fitRect({ x: 0, y: 0, w: 100, h: 100 }, 1280, 720).z).toBe(1);
  });

  it('culls windows outside the view (with margin)', () => {
    const cam = { x: 0, y: 0, z: 1 };
    expect(isOnScreen({ x: 100, y: 100, w: 200, h: 200 }, cam, 1280, 720, 0)).toBe(true);
    expect(isOnScreen({ x: 5000, y: 100, w: 200, h: 200 }, cam, 1280, 720, 0)).toBe(false);
    expect(isOnScreen({ x: 1400, y: 100, w: 200, h: 200 }, cam, 1280, 720, 200)).toBe(true);
  });

  it('interpolates the view centre, not the corner', () => {
    const a = { x: 0, y: 0, z: 1 };
    const b = zoomAt(a, 640, 360, 2); // same centre, zoomed
    const mid = lerpCamera(a, b, 0.5, 1280, 720);
    const c = screenToWorld(mid, 640, 360);
    expect(c.x).toBeCloseTo(640, 6);
    expect(c.y).toBeCloseTo(360, 6);
  });
});

describe('arrangements', () => {
  const items = [
    { id: 'a', x: 0, y: 0, w: 400, h: 300 },
    { id: 'b', x: 0, y: 0, w: 600, h: 200 },
    { id: 'c', x: 0, y: 0, w: 300, h: 500 },
    { id: 'd', x: 0, y: 0, w: 500, h: 400 },
  ];
  const overlaps = (r: Record<string, Rect>) => {
    const v = Object.values(r);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const a = v[i], b = v[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true;
    }
    return false;
  };
  for (const kind of ['grid', 'masonry', 'row'] as const) {
    it(`${kind}: keeps sizes and never overlaps`, () => {
      const out = arrange(kind, items, { x: 10, y: 20 });
      for (const it of items) { expect(out[it.id].w).toBe(it.w); expect(out[it.id].h).toBe(it.h); }
      expect(overlaps(out)).toBe(false);
    });
  }

  it('places new windows in a free spot in view, else cascades', () => {
    const cam = { x: 0, y: 0, z: 1 };
    const first = placeNewWindow(cam, 1280, 720, { w: 600, h: 400 }, []);
    // nearest-to-centre free spot on the 40px lattice
    expect(Math.abs(first.x + 300 - 640)).toBeLessThanOrEqual(20);
    expect(Math.abs(first.y + 200 - 360)).toBeLessThanOrEqual(20);
    // a small window finds room beside a large one instead of covering it
    const big = { x: 40, y: 40, w: 700, h: 640 };
    const small = placeNewWindow(cam, 1280, 720, { w: 360, h: 300 }, [big]);
    expect(small.x).toBeGreaterThanOrEqual(big.x + big.w + 24);
    // view full: centred, stepped off the exact spot
    const full = { x: -10, y: -10, w: 1300, h: 740 };
    const a = placeNewWindow(cam, 1280, 720, { w: 600, h: 400 }, [full]);
    const b = placeNewWindow(cam, 1280, 720, { w: 600, h: 400 }, [full, a]);
    expect(a).toEqual({ x: 340, y: 160, w: 600, h: 400 });
    expect(b.x).toBe(372);
  });
});

describe('spatial store', () => {
  let bounds: Record<string, Rect>;
  const win = (id: string, x: number, y: number): SpatialWindow => ({ id, title: id, x, y, w: 400, h: 300, z: 1, minimized: false });

  beforeEach(() => {
    bounds = {};
    useSpatialStore.setState({
      enabled: true, camera: { x: 0, y: 0, z: 1 }, history: [], groups: [], undoArrange: null,
      viewport: { w: 1280, h: 720 },
      windows: { a: win('a', 0, 0), b: win('b', 50, 50), c: win('c', 3000, 3000) },
    });
    useSpatialStore.getState().registerHost({
      focus: () => {},
      setBounds: (u) => { Object.assign(bounds, u); },
      setMinimized: () => {},
      measure: () => ({ w: 1280, h: 720 }),
    });
  });

  it('arranges through the host and undoes in one step', () => {
    const st = useSpatialStore.getState();
    st.arrangeWindows('row');
    expect(Object.keys(bounds).sort()).toEqual(['a', 'b', 'c']);
    expect(bounds.b.x).toBeGreaterThan(bounds.a.x + 399);
    st.undoArrangement();
    expect(bounds.b).toEqual({ x: 50, y: 50, w: 400, h: 300 });
    expect(useSpatialStore.getState().undoArrange).toBeNull();
  });

  it('keeps each window in at most one group', () => {
    const st = useSpatialStore.getState();
    st.createGroup('Work', ['a', 'b']);
    st.createGroup('Play', ['b', 'c']);
    const g = useSpatialStore.getState().groups;
    expect(g.map((x) => [x.name, x.appIds])).toEqual([['Work', ['a']], ['Play', ['b', 'c']]]);
  });

  it('records the previous view so Back returns to it', () => {
    const st = useSpatialStore.getState();
    st.setCamera({ x: 500, y: 0, z: 1 }, { remember: true });
    expect(useSpatialStore.getState().history).toEqual([{ x: 0, y: 0, z: 1 }]);
  });

  it('repairs corrupt persisted state instead of breaking the desktop', async () => {
    const merge = (useSpatialStore as unknown as { persist: { getOptions(): { merge: (p: unknown, c: unknown) => Record<string, unknown> } } })
      .persist.getOptions().merge;
    const out = merge({
      enabled: 'yes', camera: { x: 'NaN', z: -4 },
      groups: [null, { id: 'g', name: 7, appIds: ['a', 3] }],
      layout: { a: { x: 1, y: 2, w: 3, h: 4 }, b: { x: 'bad' } },
    }, useSpatialStore.getState());
    expect(out.enabled).toBe(false);
    expect(out.camera).toEqual({ x: 0, y: 0, z: DEFAULT_LIMITS.min });
    expect(out.groups).toEqual([{ id: 'g', name: '7', color: '#0A84FF', appIds: ['a'], collapsed: false }]);
    expect(Object.keys(out.layout as object)).toEqual(['a']);
  });
});

describe('spatial: snapping, align, distribute, pinch', () => {
  it('snaps a dragged window to a neighbour edge and reports a guide', async () => {
    const { magneticSnap } = await import('../../src/renderer/shell/spatial/spatialMath');
    const other = { x: 0, y: 0, w: 400, h: 300 };
    const r = magneticSnap({ x: 405, y: 200, w: 300, h: 200 }, [other], 8);
    expect(r.x).toBe(400); // left edge -> other's right edge
    expect(r.guides.some((g) => g.axis === 'x' && g.pos === 400)).toBe(true);
    const far = magneticSnap({ x: 500, y: 500, w: 100, h: 100 }, [other], 8);
    expect(far).toEqual({ x: 500, y: 500, guides: [] });
  });

  it('aligns and distributes without changing sizes', async () => {
    const { alignRects, distributeRects } = await import('../../src/renderer/shell/spatial/spatialMath');
    const items = [
      { id: 'a', x: 10, y: 0, w: 100, h: 50 },
      { id: 'b', x: 300, y: 40, w: 200, h: 80 },
      { id: 'c', x: 900, y: 10, w: 100, h: 60 },
    ];
    const left = alignRects(items, 'left');
    expect(Object.values(left).every((r) => r.x === 10)).toBe(true);
    expect(left.b.w).toBe(200);
    const d = distributeRects(items, 'x');
    const gap1 = d.b.x - (d.a.x + 100), gap2 = d.c.x - (d.b.x + 200);
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
    expect(d.a.x).toBe(10); expect(d.c.x).toBe(900);
  });

  it('pinch zooms around the midpoint and pans with it', async () => {
    const { pinchCamera, screenToWorld } = await import('../../src/renderer/shell/spatial/spatialMath');
    const cam = { x: 0, y: 0, z: 1 };
    const before = screenToWorld(cam, 200, 200);
    const next = pinchCamera(cam, [{ x: 150, y: 200 }, { x: 250, y: 200 }], [{ x: 100, y: 200 }, { x: 300, y: 200 }]);
    expect(next.z).toBeCloseTo(2, 6);
    const after = screenToWorld(next, 200, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
  });
});

describe('spatial store: zones, views, locks, bindings, layout files', () => {
  beforeEach(() => {
    useSpatialStore.setState({
      zones: [], views: [], locked: [], camera: { x: 0, y: 0, z: 1 }, viewport: { w: 1280, h: 720 },
      windows: { a: { id: 'a', title: 'A', x: 100, y: 100, w: 400, h: 300, z: 1, minimized: false } },
    });
  });

  it('creates zones from the view and the standard set, and finds windows inside', () => {
    const st = useSpatialStore.getState();
    const id = st.createZone('Mine');
    expect(useSpatialStore.getState().windowsInZone(id)).toEqual(['a']);
    st.createPresetZones();
    const names = useSpatialStore.getState().zones.map((z) => z.name);
    expect(names).toEqual(['Mine', 'Work', 'Creative', 'Development', 'Research', 'Communication', 'Entertainment']);
    st.createPresetZones(); // idempotent
    expect(useSpatialStore.getState().zones.length).toBe(7);
  });

  it('saves views and locks windows', () => {
    const st = useSpatialStore.getState();
    const v = st.saveView('Desk');
    expect(useSpatialStore.getState().views.find((x) => x.id === v)?.camera).toEqual({ x: 0, y: 0, z: 1 });
    st.toggleLock('a');
    expect(useSpatialStore.getState().locked).toEqual(['a']);
    st.toggleLock('a');
    expect(useSpatialStore.getState().locked).toEqual([]);
  });

  it('rebinds shortcuts, refuses reserved keys and swaps on clash', () => {
    const st = useSpatialStore.getState();
    st.resetBindings();
    expect(st.setBinding('fitAll', 'ArrowLeft')).toBe(false);
    expect(useSpatialStore.getState().setBinding('fitAll', 'KeyM')).toBe(true);
    const b = useSpatialStore.getState().bindings;
    expect(b.fitAll).toBe('KeyM');
    expect(b.minimap).toBe('KeyF'); // took the old key
    useSpatialStore.getState().resetBindings();
  });

  it('round-trips a layout file and rejects foreign or broken ones', () => {
    const st = useSpatialStore.getState();
    st.createZone('Z', { x: 0, y: 0, w: 1000, h: 800 });
    const file = st.exportLayout();
    expect(file.kind).toBe('dex-spatial-layout');
    expect(file.layout.a).toEqual({ x: 100, y: 100, w: 400, h: 300 });
    useSpatialStore.setState({ zones: [] });
    expect(useSpatialStore.getState().importLayout(JSON.parse(JSON.stringify(file)))).toBeNull();
    expect(useSpatialStore.getState().zones.map((z) => z.name)).toEqual(['Z']);
    expect(useSpatialStore.getState().importLayout({ kind: 'something-else' })).toMatch(/not a DEX/);
    expect(useSpatialStore.getState().importLayout({ ...file, version: 9 })).toMatch(/Unsupported/);
    // malformed entries are dropped, not thrown
    expect(useSpatialStore.getState().importLayout({ ...file, zones: [{ id: 'x', x: 'bad' }], views: [null] })).toBeNull();
    expect(useSpatialStore.getState().zones).toEqual([]);
  });
});

describe('spatial minimap default (Part 8)', () => {
  it('starts hidden, and a persisted "on" no longer brings it back each launch', async () => {
    const { vi } = await import('vitest');
    localStorage.setItem('dex-spatial-v1', JSON.stringify({ state: { minimap: true }, version: 0 }));
    vi.resetModules();
    const { useSpatialStore } = await import('../../src/renderer/store/spatialStore');
    expect(useSpatialStore.getState().minimap).toBe(false);
    useSpatialStore.getState().toggleMinimap();
    expect(useSpatialStore.getState().minimap).toBe(true);
  });
});
