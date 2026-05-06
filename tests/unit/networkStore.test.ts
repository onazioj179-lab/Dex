// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the renderer networkStore.
 * Verifies mode cycling, IPC bridging, and rollback on error.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Track invoke calls
const invokeCalls: Array<{ ch: string; args: unknown[] }> = [];
let invokeImpl: (ch: string, ...args: unknown[]) => Promise<unknown> = async () => ({ success: true });

(globalThis as unknown as { window: unknown }).window = {
  electron: {
    invoke: (ch: string, ...args: unknown[]) => {
      invokeCalls.push({ ch, args });
      return invokeImpl(ch, ...args);
    },
  },
  navigator: { onLine: true },
};
(globalThis as unknown as { navigator: unknown }).navigator = { onLine: true };

describe('networkStore', () => {
  let store: typeof import('../../src/renderer/store/networkStore');

  beforeEach(async () => {
    invokeCalls.length = 0;
    invokeImpl = async (ch) => {
      if (ch === 'network:config') return { mode: 'full' };
      if (ch === 'network:summary') return { blockedAttempts: 3, status: 'online' };
      return { success: true };
    };
    vi.resetModules();
    store = await import('../../src/renderer/store/networkStore');
    store.useNetworkStore.setState({ mode: 'full', loaded: false, blockedAttempts: 0, online: true });
  });

  it('refresh() pulls mode and summary from main', async () => {
    invokeImpl = async (ch) => {
      if (ch === 'network:config') return { mode: 'local-only' };
      if (ch === 'network:summary') return { blockedAttempts: 7, status: 'online' };
      return { success: true };
    };
    await store.useNetworkStore.getState().refresh();
    const s = store.useNetworkStore.getState();
    expect(s.mode).toBe('local-only');
    expect(s.blockedAttempts).toBe(7);
    expect(s.loaded).toBe(true);
  });

  it('setMode() invokes network:setMode and updates local state', async () => {
    await store.useNetworkStore.getState().setMode('disabled');
    expect(store.useNetworkStore.getState().mode).toBe('disabled');
    expect(invokeCalls.find(c => c.ch === 'network:setMode')?.args[0]).toBe('disabled');
  });

  it('setMode() rolls back via refresh on IPC error', async () => {
    invokeImpl = async (ch) => {
      if (ch === 'network:setMode') throw new Error('blocked');
      if (ch === 'network:config') return { mode: 'full' };
      if (ch === 'network:summary') return { blockedAttempts: 0, status: 'online' };
      return { success: true };
    };
    await store.useNetworkStore.getState().setMode('disabled');
    expect(store.useNetworkStore.getState().mode).toBe('full');
  });

  it('cycleMode() advances full -> local-only -> disabled -> full', async () => {
    await store.useNetworkStore.getState().cycleMode();
    expect(store.useNetworkStore.getState().mode).toBe('local-only');
    await store.useNetworkStore.getState().cycleMode();
    expect(store.useNetworkStore.getState().mode).toBe('disabled');
    await store.useNetworkStore.getState().cycleMode();
    expect(store.useNetworkStore.getState().mode).toBe('full');
  });

  it('exposes consistent labels and descriptions for every mode', () => {
    for (const m of ['full', 'local-only', 'disabled'] as const) {
      expect(store.NETWORK_MODE_LABELS[m]).toBeTruthy();
      expect(store.NETWORK_MODE_DESCRIPTIONS[m]).toBeTruthy();
    }
  });
});
