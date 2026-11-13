// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Rewind was retired (owner, 2026-11-13): it could not record in the Tauri app.
// Nothing may open it again, and it is gone from every app list.
import { describe, it, expect, beforeEach } from 'vitest';
import { useRunningApps, APP_DEFINITIONS, RETIRED_APPS } from '../../src/renderer/store/runningApps';

describe('retired apps', () => {
  beforeEach(() => { useRunningApps.setState({ runningApps: [], currentAppId: 'home', sessionHistory: [] }); });

  it('Rewind is retired and not defined', () => {
    expect(RETIRED_APPS.rewind).toMatch(/retired/);
    expect(APP_DEFINITIONS.rewind).toBeUndefined();
  });

  it('launching a retired app does nothing but say so', () => {
    const toasts: string[] = [];
    const on = (e: Event) => toasts.push((e as CustomEvent).detail?.message);
    window.addEventListener('dex-toast', on);
    useRunningApps.getState().launchApp({ id: 'rewind', name: 'Rewind', icon: 'rewind' } as never);
    window.removeEventListener('dex-toast', on);
    const st = useRunningApps.getState();
    expect(st.runningApps).toEqual([]);
    expect(st.currentAppId).toBe('home');
    expect(toasts).toEqual([RETIRED_APPS.rewind]);
  });

  it('other apps still launch', () => {
    useRunningApps.getState().launchApp({ id: 'notes', name: 'Notes', icon: 'notes' } as never);
    expect(useRunningApps.getState().runningApps.map((a) => a.id)).toEqual(['notes']);
  });

  it('a stored session on a retired app comes back on Home', async () => {
    localStorage.setItem('dex-running-apps', JSON.stringify({ state: { currentAppId: 'rewind', sessionHistory: ['notes', 'rewind'] }, version: 0 }));
    await useRunningApps.persist.rehydrate();
    const st = useRunningApps.getState();
    expect(st.currentAppId).toBe('home');
    expect(st.sessionHistory).toEqual(['notes']);
  });
});
