// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  initialLayout, addTab, splitPane, closePane, closeTab, resizeDivider, cyclePane, cycleTab, parseLayout, MAX_PANES, MIN_FRACTION,
} from '../../src/renderer/components/terminalLayout';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('terminal layout', () => {
  it('splits the active pane, first split sets the axis, max panes enforced', () => {
    let l = splitPane(initialLayout(), 't1', 'column');
    const t = l.tabs[0];
    expect(t.panes).toEqual(['t1', 'p2']);
    expect(t.dir).toBe('column');
    expect(t.activePane).toBe('p2');
    expect(t.sizes).toEqual([0.5, 0.5]);
    l = splitPane(l, 't1', 'row');
    expect(l.tabs[0].dir).toBe('column');
    expect(l.tabs[0].sizes).toEqual([0.5, 0.25, 0.25]);
    l = splitPane(l, 't1', 'row');
    expect(l.tabs[0].panes).toHaveLength(MAX_PANES);
    expect(splitPane(l, 't1', 'row')).toBe(l);
    expect(sum(l.tabs[0].sizes)).toBeCloseTo(1);
  });

  it('closing a pane gives its space to a neighbour; last pane closes the tab; last tab returns null', () => {
    let l = splitPane(initialLayout(), 't1', 'row');
    l = closePane(l, 't1', 'p2')!;
    expect(l.tabs[0].panes).toEqual(['t1']);
    expect(l.tabs[0].sizes).toEqual([1]);
    expect(l.tabs[0].activePane).toBe('t1');
    l = addTab(l);
    expect(l.activeId).toBe('t3');
    l = closePane(l, 't3', 't3')!;
    expect(l.tabs.map((t) => t.id)).toEqual(['t1']);
    expect(l.activeId).toBe('t1');
    expect(closeTab(l, 't1')).toBeNull();
  });

  it('divider resize keeps the minimum and the total', () => {
    const s = resizeDivider([0.5, 0.5], 0, 0.9);
    expect(s[1]).toBeCloseTo(MIN_FRACTION);
    expect(sum(s)).toBeCloseTo(1);
    expect(resizeDivider([0.5, 0.5], 1, 0.1)).toEqual([0.5, 0.5]);
  });

  it('cycles panes and tabs with wrap-around', () => {
    let l = splitPane(splitPane(initialLayout(), 't1', 'row'), 't1', 'row');
    expect(l.tabs[0].activePane).toBe('p3');
    l = cyclePane(l, 1);
    expect(l.tabs[0].activePane).toBe('t1');
    l = cyclePane(l, -1);
    expect(l.tabs[0].activePane).toBe('p3');
    l = addTab(l);
    expect(cycleTab(l, 1).activeId).toBe('t1');
  });

  it('restores v2, migrates v1, ignores corrupt storage', () => {
    const l = splitPane(initialLayout(), 't1', 'row');
    expect(parseLayout(JSON.stringify(l), null)).toEqual(l);
    const v1 = JSON.stringify({ tabs: [{ id: 't1', name: 'build' }, { id: 't2' }], activeId: 't2', nextNum: 3 });
    const m = parseLayout(null, v1)!;
    expect(m.tabs[0]).toMatchObject({ id: 't1', name: 'build', panes: ['t1'], sizes: [1] });
    expect(m.activeId).toBe('t2');
    expect(parseLayout('{bad', null)).toBeNull();
    const bad = parseLayout(JSON.stringify({ tabs: [{ id: 'a', panes: ['a', 'b'], sizes: [-1, 2], activePane: 'zz' }] }), null)!;
    expect(bad.tabs[0].sizes).toEqual([0.5, 0.5]);
    expect(bad.tabs[0].activePane).toBe('a');
  });
});
