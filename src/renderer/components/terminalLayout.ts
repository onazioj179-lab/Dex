// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Terminal tab + split-pane layout (pure). Each tab holds 1..MAX_PANES panes
 * laid out along one axis ('row' = side by side, 'column' = stacked); `sizes`
 * are fractions that always sum to 1. Every pane is its own shell session.
 */

export const MAX_PANES = 4;
export const MIN_FRACTION = 0.12;

export type SplitDir = 'row' | 'column';

export interface TermTab {
  id: string;
  /** User-set name; overrides the auto-title. */
  name?: string;
  panes: string[];
  sizes: number[];
  dir: SplitDir;
  activePane: string;
}

export interface TermLayout {
  tabs: TermTab[];
  activeId: string;
  nextNum: number;
}

export const LAYOUT_KEY_V1 = 'dex.terminal.tabs.v1';
export const LAYOUT_KEY = 'dex.terminal.layout.v2';

export function initialLayout(): TermLayout {
  return { tabs: [{ id: 't1', panes: ['t1'], sizes: [1], dir: 'row', activePane: 't1' }], activeId: 't1', nextNum: 2 };
}

const even = (n: number) => Array.from({ length: n }, () => 1 / n);

function normSizes(sizes: unknown, n: number): number[] {
  if (!Array.isArray(sizes) || sizes.length !== n || sizes.some((x) => typeof x !== 'number' || !(x > 0))) return even(n);
  const total = (sizes as number[]).reduce((a, b) => a + b, 0);
  return (sizes as number[]).map((x) => x / total);
}

/** Read a persisted layout (v2, or a v1 tab list). Returns null when nothing usable is stored. */
export function parseLayout(v2: string | null, v1: string | null): TermLayout | null {
  try {
    if (v2) {
      const o = JSON.parse(v2) as Partial<TermLayout>;
      if (o && Array.isArray(o.tabs)) {
        const tabs: TermTab[] = o.tabs
          .filter((t): t is TermTab => !!t && typeof t.id === 'string')
          .map((t) => {
            const panes = Array.isArray(t.panes) ? t.panes.filter((p) => typeof p === 'string').slice(0, MAX_PANES) : [];
            const ps = panes.length ? panes : [t.id];
            return {
              id: t.id, name: typeof t.name === 'string' ? t.name : undefined, panes: ps,
              sizes: normSizes(t.sizes, ps.length), dir: t.dir === 'column' ? 'column' : 'row',
              activePane: ps.includes(t.activePane) ? t.activePane : ps[0],
            };
          });
        if (tabs.length) {
          const activeId = typeof o.activeId === 'string' && tabs.some((t) => t.id === o.activeId) ? o.activeId : tabs[0].id;
          return { tabs, activeId, nextNum: typeof o.nextNum === 'number' && o.nextNum > 0 ? o.nextNum : tabs.length + 2 };
        }
      }
    }
    if (v1) {
      const o = JSON.parse(v1) as { tabs?: { id?: unknown; name?: unknown }[]; activeId?: unknown; nextNum?: unknown };
      const tabs: TermTab[] = (o.tabs ?? [])
        .filter((t) => typeof t?.id === 'string')
        .map((t) => ({ id: t.id as string, name: typeof t.name === 'string' ? t.name : undefined, panes: [t.id as string], sizes: [1], dir: 'row' as const, activePane: t.id as string }));
      if (tabs.length) {
        const activeId = typeof o.activeId === 'string' && tabs.some((t) => t.id === o.activeId) ? o.activeId : tabs[tabs.length - 1].id;
        return { tabs, activeId, nextNum: typeof o.nextNum === 'number' && o.nextNum > 0 ? o.nextNum : tabs.length + 1 };
      }
    }
  } catch { /* corrupt storage: start fresh */ }
  return null;
}

export function addTab(l: TermLayout): TermLayout {
  const id = `t${l.nextNum}`;
  return { tabs: [...l.tabs, { id, panes: [id], sizes: [1], dir: 'row', activePane: id }], activeId: id, nextNum: l.nextNum + 1 };
}

/**
 * Split the active pane of a tab. The first split sets the tab's axis; later
 * splits keep it (the new pane is inserted after the active one and takes half
 * of its space). Refused at MAX_PANES.
 */
export function splitPane(l: TermLayout, tabId: string, dir: SplitDir): TermLayout {
  const tab = l.tabs.find((t) => t.id === tabId);
  if (!tab || tab.panes.length >= MAX_PANES) return l;
  const id = `p${l.nextNum}`;
  const i = tab.panes.indexOf(tab.activePane);
  const at = i < 0 ? tab.panes.length - 1 : i;
  const panes = [...tab.panes]; panes.splice(at + 1, 0, id);
  const half = tab.sizes[at] / 2;
  const sizes = [...tab.sizes]; sizes.splice(at, 1, half, half);
  const next: TermTab = { ...tab, panes, sizes, dir: tab.panes.length === 1 ? dir : tab.dir, activePane: id };
  return { ...l, tabs: l.tabs.map((t) => (t.id === tabId ? next : t)), nextNum: l.nextNum + 1 };
}

/** Close one pane; closing a tab's last pane closes the tab. Returns null when the last session closes. */
export function closePane(l: TermLayout, tabId: string, paneId: string): TermLayout | null {
  const tab = l.tabs.find((t) => t.id === tabId);
  if (!tab) return l;
  if (tab.panes.length <= 1) return closeTab(l, tabId);
  const i = tab.panes.indexOf(paneId);
  if (i < 0) return l;
  const panes = tab.panes.filter((p) => p !== paneId);
  const freed = tab.sizes[i];
  const sizes = tab.sizes.filter((_, j) => j !== i);
  sizes[Math.max(0, i - 1)] += freed; // the neighbour before (or after) takes the space
  const activePane = tab.activePane === paneId ? panes[Math.max(0, i - 1)] : tab.activePane;
  return { ...l, tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, panes, sizes, activePane } : t)) };
}

export function closeTab(l: TermLayout, tabId: string): TermLayout | null {
  const tabs = l.tabs.filter((t) => t.id !== tabId);
  if (!tabs.length) return null;
  const idx = l.tabs.findIndex((t) => t.id === tabId);
  const activeId = l.activeId === tabId ? tabs[Math.max(0, idx - 1)].id : l.activeId;
  return { ...l, tabs, activeId };
}

/** Move the divider after pane `index` by `delta` (fraction of the tab). Both neighbours keep MIN_FRACTION. */
export function resizeDivider(sizes: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= sizes.length - 1) return sizes;
  const a = sizes[index]; const b = sizes[index + 1];
  const d = Math.max(MIN_FRACTION - a, Math.min(b - MIN_FRACTION, delta));
  const out = [...sizes]; out[index] = a + d; out[index + 1] = b - d;
  return out;
}

export function focusPane(l: TermLayout, tabId: string, paneId: string): TermLayout {
  const tab = l.tabs.find((t) => t.id === tabId);
  if (!tab || tab.activePane === paneId || !tab.panes.includes(paneId)) return l;
  return { ...l, tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, activePane: paneId } : t)) };
}

/** Step the active pane (+1 / -1), wrapping. */
export function cyclePane(l: TermLayout, step: 1 | -1): TermLayout {
  const tab = l.tabs.find((t) => t.id === l.activeId);
  if (!tab || tab.panes.length < 2) return l;
  const i = tab.panes.indexOf(tab.activePane);
  return focusPane(l, tab.id, tab.panes[(i + step + tab.panes.length) % tab.panes.length]);
}

export function cycleTab(l: TermLayout, step: 1 | -1): TermLayout {
  if (l.tabs.length < 2) return l;
  const i = l.tabs.findIndex((t) => t.id === l.activeId);
  return { ...l, activeId: l.tabs[(i + step + l.tabs.length) % l.tabs.length].id };
}
