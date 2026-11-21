// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribePlatformIpc } from '../../src/renderer/services/platform/ipc';
import { destroyUkiRendererBridge, initUkiRendererBridge } from '../../src/renderer/services/ukiBridge';
import { useUkiStore } from '../../src/renderer/store/ukiStore';

const root = globalThis as typeof globalThis & {
  dex?: unknown;
  electron?: unknown;
  ipcRenderer?: unknown;
};

afterEach(() => {
  destroyUkiRendererBridge();
  delete root.dex;
  delete root.electron;
  delete root.ipcRenderer;
  useUkiStore.getState().reset();
});

describe('cross-shell platform IPC', () => {
  it('normalizes Electron events and removes the exact wrapped listener', () => {
    let registered: ((event: unknown, payload: unknown) => void) | undefined;
    const on = vi.fn((_channel: string, handler: typeof registered) => { registered = handler; });
    const off = vi.fn();
    root.electron = { ipcRenderer: { on, off } };
    const received: unknown[] = [];

    const dispose = subscribePlatformIpc('uki:response', (payload) => received.push(payload));
    registered?.({ hiddenElectronEvent: true }, { text: 'ready' });

    expect(received).toEqual([{ text: 'ready' }]);
    dispose();
    expect(off).toHaveBeenCalledWith('uki:response', registered);
  });

  it('normalizes Tauri-compatible payload events and tears them down', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const off = vi.fn((channel: string) => listeners.delete(channel));
    root.electron = {
      on: (channel: string, handler: (...args: unknown[]) => void) => listeners.set(channel, handler),
      off,
    };
    const received: unknown[] = [];

    const dispose = subscribePlatformIpc('uki:stateChanged', (payload) => received.push(payload));
    listeners.get('uki:stateChanged')?.({ state: 'thinking' });

    expect(received).toEqual([{ state: 'thinking' }]);
    dispose();
    expect(off).toHaveBeenCalledOnce();
    expect(listeners.has('uki:stateChanged')).toBe(false);
  });

  it('connects UKI state events under the Tauri compatibility shape and is restart-safe', () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const on = vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(handler);
      listeners.set(channel, channelListeners);
    });
    const off = vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(handler);
    });
    root.electron = { on, off, invoke: vi.fn(() => Promise.resolve(null)) };

    initUkiRendererBridge();
    listeners.get('uki:stateChanged')?.forEach((handler) => handler({ state: 'thinking' }));
    expect(useUkiStore.getState().state).toBe('thinking');

    destroyUkiRendererBridge();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);

    initUkiRendererBridge();
    expect(listeners.get('uki:stateChanged')?.size).toBe(1);
  });
});