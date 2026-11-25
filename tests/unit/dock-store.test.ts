// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { sanitizeDockPrefs, useDockStore, dockReserve, DOCK_RESERVE, DOCK_THICKNESS } from '../../src/renderer/store/dockStore';
import { dockLayout, dropIndex, moveTo, DOCK_MOTION, dockPositionAt } from '../../src/renderer/components/dock/dockLayout';

import { computeWorkArea } from '../../src/shared/shell/workArea';

describe('Dock prefs', () => {
  it('defaults to the Morphing Dock at the bottom, folded with auto-collapse on (owner 2026-11-17), no padding', () => {
    expect(sanitizeDockPrefs(null)).toEqual({ style: 'morphing', edge: 'bottom', align: 'center', autoCollapse: true, expanded: false, workspacePadding: 0, free: null });
  });
  it('old saved prefs take the new auto-collapse default once; marked prefs keep the user choice', () => {
    expect(sanitizeDockPrefs({ autoCollapse: false, expanded: true }).autoCollapse).toBe(true);
    expect(sanitizeDockPrefs({ autoCollapse: false, expanded: true, acV2: true })).toMatchObject({ autoCollapse: false, expanded: true });
  });
  it('rejects junk from storage', () => {
    expect(sanitizeDockPrefs({ style: 'x', edge: 'center', align: 'middle', autoCollapse: 'yes', workspacePadding: 500, free: { x: 'a', y: 2 }, acV2: true }))
      .toEqual({ style: 'morphing', edge: 'bottom', align: 'center', autoCollapse: false, expanded: true, workspacePadding: 48, free: null });
  });
  it('keeps a free position inside the screen', () => {
    expect(sanitizeDockPrefs({ free: { x: 1.7, y: -0.2 } }).free).toEqual({ x: 1, y: 0 });
    expect(sanitizeDockPrefs({ free: { x: 0.25, y: 0.5 } }).free).toEqual({ x: 0.25, y: 0.5 });
  });
  it('saves a new position without resetting expanded and collapse preferences', () => {
    const store = useDockStore.getState();
    const previous = { edge: store.edge, align: store.align, expanded: store.expanded, autoCollapse: store.autoCollapse };
    try {
      store.setPrefs({ autoCollapse: false, expanded: true });
      store.setPrefs({ edge: 'top', align: 'end' });
      expect(useDockStore.getState()).toMatchObject({ edge: 'top', align: 'end', autoCollapse: false, expanded: true });
    } finally { store.setPrefs(previous); }
  });
  it('the classic DEX Bar and fullscreen keep no strip', () => {
    expect(dockReserve({ style: 'morphing', hiddenForFullscreen: false })).toBe(DOCK_RESERVE);
    expect(dockReserve({ style: 'classic', hiddenForFullscreen: false })).toBe(0);
    expect(dockReserve({ style: 'morphing', hiddenForFullscreen: true })).toBe(0);
    expect(DOCK_RESERVE).toBeGreaterThan(DOCK_THICKNESS);
  });
});

describe('Dock layout', () => {
  it('collapsed is one tile in a circle; the trigger sits between pinned and running', () => {
    const l = dockLayout(4, 2);
    expect(l.collapsedLen).toBe(52);
    expect(l.triggerCenter).toBeGreaterThan(l.pinnedLen);
    expect(l.expandedLen).toBe(6 * 2 + l.pinnedLen + 10 + 40 + 10 + l.runningLen);
    expect(dockLayout(0, 0).expandedLen).toBe(52);
  });
  it('snaps to each corner and keeps side-center targets', () => {
    const area = computeWorkArea({ viewport: { width: 1280, height: 800 }, topBar: 48, dock: { edge: 'top', reserve: 0 } });
    expect(dockPositionAt(area, 10, 66)).toEqual({ edge: 'top', align: 'start' });
    expect(dockPositionAt(area, 1270, 66)).toEqual({ edge: 'top', align: 'end' });
    expect(dockPositionAt(area, 10, 788)).toEqual({ edge: 'bottom', align: 'start' });
    expect(dockPositionAt(area, 1270, 788)).toEqual({ edge: 'bottom', align: 'end' });
    expect(dockPositionAt(area, 10, 430)).toEqual({ edge: 'left', align: 'center' });
    // Along a side edge inside a corner zone, away from the top/bottom edge:
    // a vertical Dock at that end of the side.
    expect(dockPositionAt(area, 8, 200)).toEqual({ edge: 'left', align: 'start' });
    expect(dockPositionAt(area, 1272, 700)).toEqual({ edge: 'right', align: 'end' });
  });
  it('maps a pointer to a slot and moves ids', () => {
    expect(dropIndex(0, 5)).toBe(0);
    expect(dropIndex(88, 5)).toBe(2);
    expect(dropIndex(9999, 5)).toBe(5);
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b'], 'z', 1)).toEqual(['a', 'z', 'b']);
  });
  it('collapse is faster than expand, ease-out without overshoot', () => {
    expect(DOCK_MOTION.collapseMs).toBeLessThan(DOCK_MOTION.expandMs);
    const [x1, y1, x2, y2] = DOCK_MOTION.easing.match(/[\d.]+/g)!.map(Number);
    expect(y1).toBeLessThanOrEqual(1);
    expect(y2).toBeLessThanOrEqual(1);
    expect(x1 + x2).toBeLessThan(1); // front-loaded: ease-out
  });
});
