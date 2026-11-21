// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureCurrentClipboard, startClipboardMonitor, stopClipboardMonitor } from '../../src/renderer/services/ClipboardMonitor';
import { startContextEngine } from '../../src/renderer/services/contextEngineWiring';
import { registerFlowIntake, sendFlow, unregisterFlowIntake } from '../../src/renderer/services/FlowTransfer';
import { sharedTick } from '../../src/renderer/services/SharedTick';
import { useClipboardStore } from '../../src/renderer/store/clipboardStore';

const permissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');
const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const setClipboard = (readText: () => Promise<string>, state: PermissionState) => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
  const query = vi.fn().mockResolvedValue({ state });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
  return query;
};

beforeEach(() => {
  useClipboardStore.setState({ entries: [] });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});

afterEach(() => {
  stopClipboardMonitor();
  if (permissions) Object.defineProperty(navigator, 'permissions', permissions);
  else Reflect.deleteProperty(navigator, 'permissions');
  if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Shell clipboard and activity lifecycles', () => {
  it('captures in-app copies without requesting clipboard read permission in the background', async () => {
    const read = vi.fn().mockResolvedValue('outside DEX');
    const query = setClipboard(read, 'prompt');
    const dispose = startClipboardMonitor();
    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(read).not.toHaveBeenCalled();
    fireEvent.copy(document.body, { clipboardData: { getData: () => 'inside DEX' } });
    expect(useClipboardStore.getState().entries[0]?.content).toBe('inside DEX');
    dispose();
    fireEvent.copy(document.body, { clipboardData: { getData: () => 'after teardown' } });
    expect(useClipboardStore.getState().entries[0]?.content).toBe('inside DEX');
    expect(sharedTick.getStats().subscribers.some(({ id }) => id === 'clipboard-monitor')).toBe(false);
  });

  it('ignores a background read delivered after teardown and permits a clean restart', async () => {
    let finish!: (value: string) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }))
      .mockResolvedValue('new session clip');
    setClipboard(read, 'granted');
    const dispose = startClipboardMonitor();
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    dispose();
    const restarted = startClipboardMonitor();
    try {
      await waitFor(() => expect(useClipboardStore.getState().entries[0]?.content).toBe('new session clip'));
      finish('old session clip');
      await Promise.resolve();
      expect(useClipboardStore.getState().entries.map(entry => entry.content)).toEqual(['new session clip']);
    } finally {
      restarted();
    }
  });

  it('reads through the native bridge on request and ignores a canceled capture', async () => {
    const invoke = vi.fn().mockResolvedValue('requested contents');
    vi.stubGlobal('__TAURI__', { core: { invoke } });
    vi.stubGlobal('dex', { invoke });
    expect(await captureCurrentClipboard()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('clipboard:readText');
    const request = new AbortController();
    invoke.mockResolvedValue('canceled contents');
    const pending = captureCurrentClipboard(request.signal);
    request.abort();
    expect(await pending).toBe(false);
    expect(useClipboardStore.getState().entries.map(entry => entry.content)).toEqual(['requested contents']);
  });

  it('restarts context wiring and leaves a replacement Flow handler registered', async () => {
    const dispose = startContextEngine();
    expect(window).toHaveProperty('__dexContextEngine');
    dispose();
    expect(window).not.toHaveProperty('__dexContextEngine');
    const restarted = startContextEngine();
    try {
      expect(window).toHaveProperty('__dexContextEngine');
      const oldHandler = vi.fn().mockResolvedValue(true);
      const newHandler = vi.fn().mockResolvedValue(true);
      const removeOld = registerFlowIntake('lifecycle-fixture', oldHandler);
      registerFlowIntake('lifecycle-fixture', newHandler);
      removeOld();
      await sendFlow('lifecycle-fixture', { kind: 'text', content: 'test' });
      expect(newHandler).toHaveBeenCalled();
      expect(oldHandler).not.toHaveBeenCalled();
    } finally {
      unregisterFlowIntake('lifecycle-fixture');
      restarted();
    }
  });
});
