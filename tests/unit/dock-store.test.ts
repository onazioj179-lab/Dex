// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { sanitizeDockPrefs, dockReserve, DOCK_RESERVE, DOCK_THICKNESS } from '../../src/renderer/store/dockStore';
import { dockLayout, dropIndex, moveTo, DOCK_MOTION } from '../../src/renderer/components/dock/dockLayout';

describe('Dock prefs', () => {
  it('defaults to the Morphing Dock at the bottom, folded with auto-collapse on (owner 2026-11-17), no padding', () => {
    expect(sanitizeDockPrefs(null)).toEqual({ style: 'morphing', edge: 'bottom', autoCollapse: true, expanded: false, workspacePadding: 0 });
  });
  it('old saved prefs take the new auto-collapse default once; marked prefs keep the user choice', () => {
    expect(sanitizeDockPrefs({ autoCollapse: false, expanded: true }).autoCollapse).toBe(true);
    expect(sanitizeDockPrefs({ autoCollapse: false, expanded: true, acV2: true })).toMatchObject({ autoCollapse: false, expanded: true });
  });
  it('rejects junk from storage', () => {
    expect(sanitizeDockPrefs({ style: 'x', edge: 'top', autoCollapse: 'yes', workspacePadding: 500, acV2: true }))
      .toEqual({ style: 'morphing', edge: 'bottom', autoCollapse: false, expanded: true, workspacePadding: 48 });
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
