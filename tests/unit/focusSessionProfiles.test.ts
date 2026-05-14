// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal zustand mock for the persist middleware path (zustand v4 curried API)
// ---------------------------------------------------------------------------
vi.mock('zustand', () => {
  const create = () => (fn: any) => {
    let state: any;
    const setState = (partial: any) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      state = { ...state, ...next };
    };
    const getState = () => state;
    state = fn(setState, getState);
    const useStore = (selector?: any) => selector ? selector(state) : state;
    useStore.getState = getState;
    useStore.setState = setState;
    return useStore;
  };
  return { create };
});

vi.mock('zustand/middleware', () => ({
  persist: (fn: any, _opts: any) => fn,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FocusSessionSystem — AppFocusProfile (J11)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getAppFocusProfile returns defaults for unknown appId', async () => {
    const { useFocusSessionStore } = await import('../../src/renderer/services/FocusSessionSystem');
    const profile = useFocusSessionStore.getState().getAppFocusProfile('unknown-app');
    expect(profile.hideChrome).toBe(false);
    expect(profile.muteNotifications).toBe(true);
    expect(profile.dimBackground).toBe(false);
  });

  it('setAppFocusProfile stores overrides for an appId', async () => {
    const { useFocusSessionStore } = await import('../../src/renderer/services/FocusSessionSystem');
    const store = useFocusSessionStore.getState();
    store.setAppFocusProfile('prism', { hideChrome: true, dimBackground: true });
    const profile = useFocusSessionStore.getState().getAppFocusProfile('prism');
    expect(profile.hideChrome).toBe(true);
    expect(profile.dimBackground).toBe(true);
    expect(profile.muteNotifications).toBe(true); // default preserved
  });

  it('setAppFocusProfile updates only provided fields (partial merge)', async () => {
    const { useFocusSessionStore } = await import('../../src/renderer/services/FocusSessionSystem');
    const store = useFocusSessionStore.getState();
    store.setAppFocusProfile('vinx', { hideChrome: true });
    store.setAppFocusProfile('vinx', { muteNotifications: false });
    const profile = useFocusSessionStore.getState().getAppFocusProfile('vinx');
    expect(profile.hideChrome).toBe(true);      // first call preserved
    expect(profile.muteNotifications).toBe(false); // second call applied
    expect(profile.dimBackground).toBe(false);  // default preserved
  });

  it('multiple apps have independent profiles', async () => {
    const { useFocusSessionStore } = await import('../../src/renderer/services/FocusSessionSystem');
    const store = useFocusSessionStore.getState();
    store.setAppFocusProfile('notes', { hideChrome: true });
    store.setAppFocusProfile('imosion', { dimBackground: true });
    expect(useFocusSessionStore.getState().getAppFocusProfile('notes').hideChrome).toBe(true);
    expect(useFocusSessionStore.getState().getAppFocusProfile('notes').dimBackground).toBe(false);
    expect(useFocusSessionStore.getState().getAppFocusProfile('imosion').hideChrome).toBe(false);
    expect(useFocusSessionStore.getState().getAppFocusProfile('imosion').dimBackground).toBe(true);
  });

  it('appFocusProfiles initialises as empty record', async () => {
    const { useFocusSessionStore } = await import('../../src/renderer/services/FocusSessionSystem');
    const { appFocusProfiles } = useFocusSessionStore.getState();
    expect(typeof appFocusProfiles).toBe('object');
  });
});
