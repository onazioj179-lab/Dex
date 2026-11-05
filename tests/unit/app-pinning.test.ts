// =============================================================================
// DEX Platform — universal app pinning, registry search and quick actions
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function load() {
  const pins = await import('../../src/renderer/store/dockPinStore');
  const svc = await import('../../src/renderer/services/appPinning');
  return { store: pins.useDockPins, appPinning: svc.appPinning };
}

describe('shared pinning service', () => {
  it('pins any eligible app to the Dock and the App Menu, without duplicates', async () => {
    const { store, appPinning } = await load();
    appPinning.pin('dock', 'ledger', { quiet: true });
    appPinning.pin('dock', 'ledger', { quiet: true });
    appPinning.pin('menu', 'ledger', { quiet: true });
    appPinning.pin('menu', 'ledger', { quiet: true });
    expect(store.getState().pins.filter(p => p.id === 'ledger')).toHaveLength(1);
    expect(store.getState().menuPins.filter(id => id === 'ledger')).toHaveLength(1);
    expect(appPinning.isPinned('dock', 'ledger')).toBe(true);
    expect(appPinning.isPinned('menu', 'ledger')).toBe(true);
  });

  it('refuses ineligible ids (home, unknown apps)', async () => {
    const { appPinning } = await load();
    expect(appPinning.pin('dock', 'home', { quiet: true })).toBe(false);
    expect(appPinning.pin('dock', 'not-an-app', { quiet: true })).toBe(false);
    expect(appPinning.isPinned('dock', 'home')).toBe(false);
  });

  it('unpins any pinned app', async () => {
    const { appPinning } = await load();
    for (const id of appPinning.dockIds()) appPinning.unpin('dock', id, { quiet: true });
    expect(appPinning.dockIds()).toEqual([]);
    appPinning.unpin('menu', 'settings', { quiet: true });
    expect(appPinning.isPinned('menu', 'settings')).toBe(false);
  });

  it('reorders by placing before another app (drag & drop / Alt+arrows)', async () => {
    const { appPinning } = await load();
    for (const id of appPinning.dockIds()) appPinning.unpin('dock', id, { quiet: true });
    ['files', 'browser', 'notes'].forEach(id => appPinning.pin('dock', id, { quiet: true }));
    appPinning.place('dock', 'notes', 'files');
    expect(appPinning.dockIds()).toEqual(['notes', 'files', 'browser']);
    appPinning.place('dock', 'notes', null);
    expect(appPinning.dockIds()).toEqual(['files', 'browser', 'notes']);
    // Dropping an unpinned app pins it at that position.
    appPinning.place('dock', 'ledger', 'browser');
    expect(appPinning.dockIds()).toEqual(['files', 'ledger', 'browser', 'notes']);

    for (const id of appPinning.menuIds()) appPinning.unpin('menu', id, { quiet: true });
    ['files', 'browser', 'notes'].forEach(id => appPinning.pin('menu', id, { quiet: true }));
    appPinning.place('menu', 'files', 'notes');
    expect(appPinning.menuIds()).toEqual(['browser', 'files', 'notes']);
    appPinning.place('menu', 'files', null);
    expect(appPinning.menuIds()).toEqual(['browser', 'notes', 'files']);
  });

  it('persists Dock and App Menu pins across reloads', async () => {
    const first = await load();
    for (const id of first.appPinning.dockIds()) first.appPinning.unpin('dock', id, { quiet: true });
    first.appPinning.pin('dock', 'ledger', { quiet: true });
    first.appPinning.pin('dock', 'calendar', { quiet: true });
    first.appPinning.pin('menu', 'weather', { quiet: true });
    vi.resetModules();
    const second = await load();
    expect(second.appPinning.dockIds()).toEqual(['ledger', 'calendar']);
    expect(second.appPinning.menuIds()).toContain('weather');
  });

  it('keeps an explicitly emptied Dock empty after reload', async () => {
    const first = await load();
    for (const id of first.appPinning.dockIds()) first.appPinning.unpin('dock', id, { quiet: true });
    vi.resetModules();
    const second = await load();
    expect(second.appPinning.dockIds()).toEqual([]);
  });

  it('heals duplicated stored pins', async () => {
    localStorage.setItem('dex-dock-pins', JSON.stringify([{ id: 'files', position: 0 }, { id: 'files', position: 1 }, { id: 'notes', position: 2 }]));
    const { appPinning } = await load();
    expect(appPinning.dockIds()).toEqual(['files', 'notes']);
  });
});

describe('app registry search', () => {
  it('finds apps by name and category, and registered actions', async () => {
    const { searchApps } = await import('../../src/renderer/services/appRegistry');
    const ids = ['ledger', 'notes', 'browser', 'dexcode', 'calendar', 'calculator'];
    const led = searchApps('ledger', ids);
    expect(led[0]).toMatchObject({ kind: 'app', appId: 'ledger' });
    const nt = searchApps('new transaction', ids);
    expect(nt[0]).toMatchObject({ kind: 'action', appId: 'ledger', actionId: 'new-transaction' });
    const tab = searchApps('new tab', ids);
    expect(tab[0]).toMatchObject({ kind: 'action', appId: 'browser', actionId: 'new-tab' });
    expect(searchApps('productivity', ids).some(h => h.appId === 'ledger')).toBe(true);
  });

  it('never resolves a query to an unrelated app or action', async () => {
    const { searchApps } = await import('../../src/renderer/services/appRegistry');
    const ids = ['ledger', 'notes', 'browser', 'dexcode'];
    expect(searchApps('zzqx', ids)).toEqual([]);
    // "calc" must not run a Ledger action just because it is close in some fuzzy sense.
    expect(searchApps('calc', ids)).toEqual([]);
    // An app name outranks an action that merely mentions it.
    expect(searchApps('notes', ids)[0]).toMatchObject({ kind: 'app', appId: 'notes' });
  });
});

describe('app intents', () => {
  it('queues an action until the app registers, then delivers it once', async () => {
    vi.useFakeTimers();
    const { dispatchAppIntent, registerAppIntentHandler, __resetAppIntents } = await import('../../src/renderer/services/appIntents');
    __resetAppIntents();
    const seen: string[] = [];
    dispatchAppIntent('ledger', 'open-budget');
    const off = registerAppIntentHandler('ledger', (a) => { seen.push(a); return true; });
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['open-budget']);
    dispatchAppIntent('ledger', 'open-reports');
    expect(seen).toEqual(['open-budget', 'open-reports']);
    off();
    vi.useRealTimers();
  });
});
