// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  WindowLifecycleStore, tile, type LifecycleEvent,
} from '../../src/shared/phase3/lifecycle';

function newStore() {
  const s = new WindowLifecycleStore();
  s.createWorkspace({ id: 'ws1', name: 'Main' });
  return s;
}

describe('Phase 3 - WindowLifecycleStore', () => {
  it('creates workspaces and windows', () => {
    const s = newStore();
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 'Editor', x: 0, y: 0, width: 800, height: 600 });
    expect(s.listWorkspaces().map((w) => w.id)).toEqual(['ws1']);
    expect(s.listWindows().map((w) => w.id)).toEqual(['w1']);
    expect(s.activeWorkspaceId()).toBe('ws1');
  });

  it('rejects duplicates and unknown workspace', () => {
    const s = newStore();
    expect(() => s.createWorkspace({ id: 'ws1', name: 'dup' })).toThrow();
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 0, y: 0, width: 1, height: 1 });
    expect(() => s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 0, y: 0, width: 1, height: 1 })).toThrow();
    expect(() => s.createWindow({ id: 'w2', workspaceId: 'missing', title: 't', x: 0, y: 0, width: 1, height: 1 })).toThrow();
  });

  it('removing workspace removes its windows', () => {
    const s = newStore();
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 0, y: 0, width: 1, height: 1 });
    s.createWorkspace({ id: 'ws2', name: 'B' });
    s.removeWorkspace('ws1');
    expect(s.listWindows().length).toBe(0);
    expect(s.activeWorkspaceId()).toBe('ws2');
  });

  it('focus brings a window to top and unfocuses others', () => {
    const s = newStore();
    s.createWindow({ id: 'a', workspaceId: 'ws1', title: 'a', x: 0, y: 0, width: 1, height: 1, focused: true });
    s.createWindow({ id: 'b', workspaceId: 'ws1', title: 'b', x: 0, y: 0, width: 1, height: 1 });
    s.focusWindow('b');
    const windows = s.listWindows();
    const a = windows.find((w) => w.id === 'a')!;
    const b = windows.find((w) => w.id === 'b')!;
    expect(b.focused).toBe(true);
    expect(a.focused).toBe(false);
    expect(b.z).toBeGreaterThan(a.z);
  });

  it('updateWindow patches and emits change', () => {
    const s = newStore();
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 0, y: 0, width: 100, height: 100 });
    const events: LifecycleEvent[] = [];
    s.subscribe((e) => events.push(e));
    s.updateWindow('w1', { width: 500 });
    expect(s.listWindows()[0]!.width).toBe(500);
    expect(events.some((e) => e.type === 'window-changed')).toBe(true);
  });

  it('snapshot + restore is round-trip stable', () => {
    const s = newStore();
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 1, y: 2, width: 3, height: 4 });
    const snap = s.snapshot(123);
    const s2 = new WindowLifecycleStore();
    s2.restore(snap);
    expect(s2.snapshot(123)).toEqual(snap);
  });

  it('subscriber isolation: throwing listener does not break others', () => {
    const s = newStore();
    const ok = vi.fn();
    s.subscribe(() => { throw new Error('bad'); });
    s.subscribe(ok);
    s.createWindow({ id: 'w1', workspaceId: 'ws1', title: 't', x: 0, y: 0, width: 1, height: 1 });
    expect(ok).toHaveBeenCalled();
  });
});

describe('Phase 3 - tile()', () => {
  const vp = { x: 0, y: 0, width: 1000, height: 600 };

  it('maximize produces one cell', () => {
    expect(tile('maximize', 1, vp)).toEqual([vp]);
  });

  it('splitH divides width', () => {
    const r = tile('splitH', 4, vp);
    expect(r.length).toBe(4);
    expect(r[0]!.width).toBe(250);
  });

  it('splitV divides height', () => {
    const r = tile('splitV', 3, vp);
    expect(r.length).toBe(3);
    expect(r[0]!.height).toBe(200);
  });

  it('quad caps at 4 cells', () => {
    expect(tile('quad', 10, vp).length).toBe(4);
    expect(tile('quad', 2, vp).length).toBe(2);
  });

  it('mainSidebar gives 66/33 split for >=2', () => {
    const r = tile('mainSidebar', 3, vp);
    expect(r.length).toBe(3);
    expect(r[0]!.width).toBe(660);
    expect(r[1]!.width).toBe(340);
  });

  it('thirds caps at 3 cells', () => {
    expect(tile('thirds', 5, vp).length).toBe(3);
  });

  it('returns [] for count <= 0', () => {
    expect(tile('maximize', 0, vp)).toEqual([]);
  });
});
