// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { DOCK_ROW, DOCK_PAD, defaultDockAnchor, placeDock, magnetDockAnchor } from '../../src/renderer/components/floatingLauncherGeometry';
import { allowsSelectAll, installSelectionGuard } from '../../src/renderer/shell/selectionGuard';
import { useFloatingLauncher } from '../../src/renderer/store/floatingLauncherStore';
import { computeWorkArea, maximizedRect, fitToWorkArea, recoverOffscreen, snapToDevice } from '../../src/renderer/shell/workArea';

describe('Desktop Work Area Manager', () => {
  it('fills everything below the top bar; the Dock reserves nothing', () => {
    expect(computeWorkArea({ viewportW: 1440, viewportH: 900, topBar: 34 })).toEqual({ x: 0, y: 34, w: 1440, h: 866 });
    expect(maximizedRect(computeWorkArea({ viewportW: 1280, viewportH: 720 }))).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
  });
  it('honours safe-area insets and snaps to device pixels at 125% / 150%', () => {
    const a = computeWorkArea({ viewportW: 1000.3, viewportH: 700.7, topBar: 34, safe: { left: 10, bottom: 20 }, scale: 1.5 });
    expect(a.x).toBe(10);
    expect(a.y).toBe(34);
    expect(a.w * 1.5).toBeCloseTo(Math.round(a.w * 1.5));
    expect(snapToDevice(10.3, 1.25)).toBeCloseTo(10.4);
  });
  it('fits windows inside, keeps minimums, recovers off-screen ones', () => {
    const area = { x: 0, y: 34, w: 1200, h: 766 };
    expect(fitToWorkArea({ x: -50, y: 0, w: 2000, h: 100 }, area, { w: 400, h: 300 })).toEqual({ x: 0, y: 34, w: 1200, h: 300 });
    expect(recoverOffscreen({ x: 1180, y: 100, w: 600, h: 400 }, area)).toEqual({ x: 600, y: 100, w: 600, h: 400 });
    const reachable = { x: 900, y: 100, w: 600, h: 400 };
    expect(recoverOffscreen(reachable, area)).toEqual(reachable);
  });
});

describe('Dock geometry', () => {
  it('defaults to bottom-centre and stays inside the viewport at any width', () => {
    const a = defaultDockAnchor(1440, 900);
    expect(a).toEqual({ cx: 720, y: 900 - DOCK_ROW - DOCK_PAD });
    const collapsed = placeDock(a.cx, a.y, DOCK_ROW, 1440, 900, 34);
    expect(collapsed.left).toBe(720 - DOCK_ROW / 2);
    const nearEdge = placeDock(1430, a.y, 500, 1440, 900, 34);
    expect(nearEdge.left + 500).toBeLessThanOrEqual(1440 - DOCK_PAD);
  });
  it('never sits on the top bar', () => {
    expect(placeDock(500, 0, 300, 1440, 900, 34).top).toBe(34 + DOCK_PAD);
  });
  it('magnets to the bottom edge and the centre line', () => {
    expect(magnetDockAnchor(735, 900 - DOCK_ROW - DOCK_PAD - 10, 1440, 900, 34)).toEqual({ cx: 720, y: 900 - DOCK_ROW - DOCK_PAD });
    expect(magnetDockAnchor(300, 400, 1440, 900, 34)).toEqual({ cx: 300, y: 400 });
  });
});

describe('Dock store', () => {
  it('persists anchor and auto-collapse; expanded is runtime only', () => {
    const s = useFloatingLauncher.getState();
    s.setAnchor(640, 500);
    s.setAutoCollapse(false);
    s.setExpanded(true);
    const saved = JSON.parse(localStorage.getItem('dex-dock-v3')!);
    expect(saved).toMatchObject({ cx: 640, y: 500, autoCollapse: false });
    expect(saved.expanded).toBeUndefined();
    s.setAutoCollapse(true);
  });
});

describe('selection guard', () => {
  it('allows select-all only in real text', () => {
    document.body.innerHTML = '<div id="chrome"><span id="label">Files</span></div><input id="f"/><div contenteditable="true"><p id="p">x</p></div><div data-selectable><span id="s">y</span></div>';
    expect(allowsSelectAll(document.getElementById('label'))).toBe(false);
    expect(allowsSelectAll(document.getElementById('f'))).toBe(true);
    expect(allowsSelectAll(document.getElementById('p'))).toBe(true);
    expect(allowsSelectAll(document.getElementById('s'))).toBe(true);
  });
  it('cancels Ctrl+A on chrome but lets apps still hear the key', () => {
    document.body.innerHTML = '<button id="b">Open</button>';
    const off = installSelectionGuard(window);
    let heard = false;
    const btn = document.getElementById('b')!;
    btn.addEventListener('keydown', () => { heard = true; });
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    btn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(heard).toBe(true);
    off();
  });
});

describe('no global alert slop', () => {
  it('role="alert" carries no stylesheet look (no orange stripe / amber wash)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const css = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/styles/globals.css'), 'utf8');
    expect(/\[role="alert"\]\s*\{/.test(css)).toBe(false);
  });
});

describe('achievement meta tiers use the catalog threshold', () => {
  it('a points tier unlocks exactly at the number its description shows', async () => {
    const { ACHIEVEMENTS } = await import('../../src/renderer/services/achievementsCatalog');
    const tier = ACHIEVEMENTS.find(a => a.id === 'points-4')!;
    const n = Number(tier.description.replace(/[^0-9]/g, ''));
    expect(tier.condition({ achievementPoints: n - 1 } as never)).toBe(false);
    expect(tier.condition({ achievementPoints: n } as never)).toBe(true);
    expect(tier.progress!({ achievementPoints: n / 2 } as never)).toEqual({ current: n / 2, target: n });
  });
});

describe('meta trophy repair (revoke early unlocks)', () => {
  it('takes back points tiers the old table granted early and keeps real trophies', async () => {
    const { repairMetaUnlocks, getTotalPoints } = await import('../../src/renderer/services/engagement');
    const { ACHIEVEMENTS } = await import('../../src/renderer/services/achievementsCatalog');
    const real = ACHIEVEMENTS.filter(a => !/^(points-|ach-count-|rank-|final-)/.test(a.id)).slice(0, 5).map(a => a.id);
    const state = {
      stats: {} as never, lastTipIndex: 0, dismissedTips: [],
      unlockedAchievements: [...real, 'points-4', 'points-6', 'rank-legend'],
      unlockedAt: Object.fromEntries([...real, 'points-4', 'points-6', 'rank-legend'].map(id => [id, 1])),
    };
    const out = repairMetaUnlocks(state);
    for (const id of real) expect(out.unlockedAchievements).toContain(id);
    expect(out.unlockedAchievements).not.toContain('points-6');
    expect(out.unlockedAchievements).not.toContain('rank-legend');
    expect(getTotalPoints(out.unlockedAchievements)).toBeLessThan(getTotalPoints(state.unlockedAchievements));
    expect(Object.keys(out.unlockedAt!).length).toBe(out.unlockedAchievements.length);
  });
  it('runs once on load and persists the flag', async () => {
    const { loadEngagement } = await import('../../src/renderer/services/engagement');
    localStorage.setItem('dex-engagement-state', JSON.stringify({ unlockedAchievements: ['points-8'], stats: {} }));
    const s = loadEngagement();
    expect(s.metaRepairV1).toBe(true);
    expect(s.unlockedAchievements).not.toContain('points-8');
    expect(JSON.parse(localStorage.getItem('dex-engagement-state')!).metaRepairV1).toBe(true);
  });
});
