// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { magnetBar } from '../../src/renderer/components/FloatingLauncher';
import { EDGE_PAD } from '../../src/renderer/components/floatingLauncherGeometry';
import { allowsSelectAll, installSelectionGuard } from '../../src/renderer/shell/selectionGuard';
import { useFloatingLauncher } from '../../src/renderer/store/floatingLauncherStore';

describe('DEX Bar edge magnet', () => {
  const vw = 1440, vh = 900, w = 560, h = 44;
  it('snaps flush to an edge it was dropped near', () => {
    expect(magnetBar(EDGE_PAD + 10, 300, vw, vh, w, h)).toEqual({ x: EDGE_PAD, y: 300 });
    expect(magnetBar(vw - w - EDGE_PAD - 12, vh - h - EDGE_PAD - 5, vw, vh, w, h))
      .toEqual({ x: vw - w - EDGE_PAD, y: vh - h - EDGE_PAD });
  });
  it('centres horizontally when dropped near the middle', () => {
    expect(magnetBar(Math.round((vw - w) / 2) + 15, 400, vw, vh, w, h).x).toBe(Math.round((vw - w) / 2));
  });
  it('leaves a bar dropped in open space where it is', () => {
    expect(magnetBar(200, 400, vw, vh, w, h)).toEqual({ x: 200, y: 400 });
  });
});

describe('DEX Bar store: fold + work-area reserve', () => {
  it('persists folded and ignores no-op reserve writes', () => {
    const s = useFloatingLauncher.getState();
    s.setFolded(true);
    expect(useFloatingLauncher.getState().folded).toBe(true);
    expect(localStorage.getItem('dex-bar-folded')).toBe('1');
    s.setFolded(false);
    s.setReserveBottom(62.4);
    expect(useFloatingLauncher.getState().reserveBottom).toBe(62);
    s.setReserveBottom(-5);
    expect(useFloatingLauncher.getState().reserveBottom).toBe(0);
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
