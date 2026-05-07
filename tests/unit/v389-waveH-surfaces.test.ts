// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 wave H - UI surface tests

import { describe, it, expect } from 'vitest';
import {
  bindingsFor,
  dismissToast,
  expireToasts,
  FOCUS_RINGS,
  getEmptyState,
  listEmptyStateKeys,
  markUsed,
  newPaletteRecency,
  newToastQueue,
  pushToast,
  rankPalette,
  scorePaletteEntry,
} from '../../src/shared/theme/surfaces';

describe('wave H - empty states', () => {
  it('catalogues every app surface', () => {
    const keys = listEmptyStateKeys();
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const k of keys) {
      const e = getEmptyState(k);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.body.length).toBeGreaterThan(0);
      expect(e.cta.length).toBeGreaterThan(0);
      expect(e.ctaAction.length).toBeGreaterThan(0);
    }
  });

  it('notes empty state suggests creating a note', () => {
    const e = getEmptyState('notes');
    expect(e.ctaAction).toBe('notes.new');
  });
});

describe('wave H - palette ranking', () => {
  const entries = [
    { id: 'a', label: 'Open Settings' },
    { id: 'b', label: 'Open Folder' },
    { id: 'c', label: 'Settings - Account' },
    { id: 'd', label: 'Save File', baseWeight: 5 },
  ];

  it('exact match outranks prefix outranks substring', () => {
    const r = rankPalette(entries, 'open', 0);
    expect(r[0].entry.label).toBe('Open Settings');
    expect(r[1].entry.label).toBe('Open Folder');
    // 'Settings - Account' does not contain 'open' nor have it as subsequence — filtered.
    expect(r).toHaveLength(2);
  });

  it('subsequence match included with low score', () => {
    const r = rankPalette(entries, 'oset', 0);
    // 'oset' is a subsequence of 'Open Settings' (o, s, e, t)? Yes (O...Set)
    const ids = r.map((x) => x.entry.id);
    expect(ids).toContain('a');
  });

  it('empty query returns all entries with stable order', () => {
    const r = rankPalette(entries, '', 0);
    expect(r.map((x) => x.entry.id)).toEqual(['d', 'a', 'b', 'c']);
    // 'd' has baseWeight=5 so it ranks first even with empty query
  });

  it('recency boosts a recently-used entry', () => {
    const rec = markUsed(newPaletteRecency(), 'b', 1000);
    const r = rankPalette(entries, 'open', 1010, rec);
    expect(r[0].entry.id).toBe('b'); // 'b' got recency boost over 'a'
  });

  it('scorePaletteEntry returns 0 when nothing matches', () => {
    expect(scorePaletteEntry({ id: 'x', label: 'Hello World' }, 'zzz', 0, newPaletteRecency())).toBe(0);
  });
});

describe('wave H - keyboard map', () => {
  it('global scope returns globals only', () => {
    const g = bindingsFor('global');
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((b) => b.scope === 'global')).toBe(true);
  });

  it('app scope includes globals first then app-specific', () => {
    const n = bindingsFor('notes');
    const firstApp = n.findIndex((b) => b.scope === 'notes');
    const lastGlobal = (() => {
      let last = -1;
      n.forEach((b, i) => { if (b.scope === 'global') last = i; });
      return last;
    })();
    expect(lastGlobal).toBeLessThan(firstApp);
    expect(n.some((b) => b.combo === 'Ctrl+K')).toBe(true);
    expect(n.some((b) => b.combo === 'Ctrl+N')).toBe(true);
  });

  it('? opens the keyboard map (global)', () => {
    expect(bindingsFor('global').some((b) => b.combo === '?')).toBe(true);
  });
});

describe('wave H - focus ring tokens', () => {
  it('exposes default, inset and destructive variants', () => {
    expect(FOCUS_RINGS.default.outline).toContain('var(--color-accent)');
    expect(FOCUS_RINGS.inset.outlineOffset).toBe('-2px');
    expect(FOCUS_RINGS.destructive.outline).toContain('var(--color-danger)');
  });
});

describe('wave H - toast queue', () => {
  it('pushes a toast with the kind default ttl', () => {
    const q = pushToast(newToastQueue(), {
      id: 't1', kind: 'success', title: 'Saved', now: 0,
    });
    expect(q.toasts).toHaveLength(1);
    expect(q.toasts[0].ttlMs).toBe(3000);
  });

  it('overwrites a toast with the same id (no stacking)', () => {
    let q = newToastQueue();
    q = pushToast(q, { id: 't1', kind: 'info', title: 'a', now: 0 });
    q = pushToast(q, { id: 't1', kind: 'info', title: 'b', now: 100 });
    expect(q.toasts).toHaveLength(1);
    expect(q.toasts[0].title).toBe('b');
  });

  it('dismisses by id', () => {
    let q = pushToast(newToastQueue(), { id: 't1', kind: 'info', title: 'x', now: 0 });
    q = dismissToast(q, 't1');
    expect(q.toasts).toHaveLength(0);
  });

  it('expires toasts whose ttl has elapsed but keeps sticky', () => {
    let q = newToastQueue();
    q = pushToast(q, { id: 'a', kind: 'info', title: 'a', now: 0, ttlMs: 1000 });
    q = pushToast(q, { id: 'b', kind: 'info', title: 'b', now: 0, ttlMs: 0 }); // sticky
    q = expireToasts(q, 5000);
    expect(q.toasts.map((t) => t.id)).toEqual(['b']);
  });

  it('error toasts default to longer ttl than info', () => {
    const e = pushToast(newToastQueue(), { id: 'e', kind: 'error', title: 'oops', now: 0 });
    const i = pushToast(newToastQueue(), { id: 'i', kind: 'info', title: 'hi', now: 0 });
    expect(e.toasts[0].ttlMs).toBeGreaterThan(i.toasts[0].ttlMs);
  });
});
