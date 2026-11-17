// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { computeLiveTabs, liveTabBudget, parseBusyCheck, PAGE_BUSY_CHECK, LIVE_TAB_BUDGET } from '../../src/renderer/services/browser/tabResidency';

const tabs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, url: `https://example.com/${i}` }));

describe('browser tab residency', () => {
  it('a restored 500-tab session keeps one live page (the active tab)', () => {
    const live = computeLiveTabs({ tabs: tabs(500), activeId: 't0', lastActiveAt: new Map([['t0', 1]]), busy: new Set(), budget: 5 });
    expect([...live]).toEqual(['t0']);
  });

  it('keeps the most recently used tabs up to the budget, then sleeps the rest', () => {
    const last = new Map(Array.from({ length: 20 }, (_, i) => [`t${i}`, i] as [string, number]));
    const live = computeLiveTabs({ tabs: tabs(20), activeId: 't19', lastActiveAt: last, busy: new Set(), budget: 3 });
    expect(live).toEqual(new Set(['t19', 't18', 't17', 't16']));
  });

  it('never sleeps the active tab, a Keep awake tab or a busy tab, and they do not use the budget', () => {
    const t = tabs(6);
    t[2] = { ...t[2], keepAwake: true } as typeof t[number];
    const last = new Map([['t0', 1], ['t1', 2], ['t3', 3], ['t4', 4]]);
    const live = computeLiveTabs({ tabs: t, activeId: 't5', lastActiveAt: last, busy: new Set(['t0']), budget: 1 });
    expect(live).toEqual(new Set(['t5', 't2', 't0', 't4']));
  });

  it('pinned tabs win the budget over newer ones', () => {
    const t = tabs(3).map((x, i) => (i === 0 ? { ...x, pinned: true } : x));
    const live = computeLiveTabs({ tabs: t, activeId: 't2', lastActiveAt: new Map([['t0', 1], ['t1', 5], ['t2', 9]]), busy: new Set(), budget: 1 });
    expect(live).toEqual(new Set(['t2', 't0']));
  });

  it('blank tabs have no page to keep', () => {
    const live = computeLiveTabs({ tabs: [{ id: 'a', url: '' }], activeId: 'a', lastActiveAt: new Map(), busy: new Set(), budget: 5 });
    expect(live.size).toBe(0);
  });

  it('budget follows the performance tier; Resource Saver (low) is the smallest; a user number wins', () => {
    expect(liveTabBudget('low')).toBe(LIVE_TAB_BUDGET.low);
    expect(liveTabBudget('low')).toBeLessThan(liveTabBudget('mid'));
    expect(liveTabBudget(null)).toBe(LIVE_TAB_BUDGET.mid);
    expect(liveTabBudget('ultra', 0)).toBe(0);
    expect(liveTabBudget('low', 999)).toBe(50);
  });

  it('page busy check is a single expression and parses safely', () => {
    expect(() => new Function(`return (${PAGE_BUSY_CHECK}\n);`)).not.toThrow();
    expect(parseBusyCheck('{"media":true,"edited":false}')).toEqual({ media: true, edited: false });
    expect(parseBusyCheck('garbage')).toEqual({ media: false, edited: false });
    expect(parseBusyCheck(null)).toEqual({ media: false, edited: false });
  });
});
