// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  acceleratorFromEvent, runGlobalHotkeyAction, startGlobalHotkeyListener, setGlobalHotkey,
} from '../../src/renderer/services/globalHotkeys';

const ev = (key: string, code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
  ({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

afterEach(() => { delete (globalThis as { dex?: unknown }).dex; });

describe('system-wide shortcuts (renderer)', () => {
  it('records a key combination layout-independently', () => {
    expect(acceleratorFromEvent(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(ev('k', 'KeyK', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+K');
    expect(acceleratorFromEvent(ev('!', 'Digit1', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+1');
    expect(acceleratorFromEvent(ev(' ', 'Space', { altKey: true, ctrlKey: true }))).toBe('Ctrl+Alt+Space');
    expect(acceleratorFromEvent(ev('F5', 'F5', { metaKey: true }))).toBe('Win+F5');
    expect(acceleratorFromEvent(ev('ArrowUp', 'ArrowUp', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+Up');
  });

  it('routes each action to its target', () => {
    const t = { openUki: vi.fn(), openSearch: vi.fn(), openClipboard: vi.fn(), newNote: vi.fn(), openTerminal: vi.fn() };
    for (const a of ['ask-uki', 'search', 'clipboard', 'new-note', 'terminal']) expect(runGlobalHotkeyAction(a, t)).toBe(true);
    expect(runGlobalHotkeyAction('show-dex', t)).toBe(false);
    expect([t.openUki, t.openSearch, t.openClipboard, t.newNote, t.openTerminal].every((f) => f.mock.calls.length === 1)).toBe(true);
  });

  it('listens to native presses and stops on cleanup', () => {
    const handlers = new Map<string, (...a: unknown[]) => void>();
    const off = vi.fn();
    (globalThis as { dex?: unknown }).dex = {
      invoke: vi.fn(),
      on: (ch: string, fn: (...a: unknown[]) => void) => { handlers.set(ch, fn); },
      off,
    };
    const launch = vi.fn();
    const openUki = vi.fn();
    const stop = startGlobalHotkeyListener(launch, openUki);
    handlers.get('global-hotkey:pressed')?.({ action: 'ask-uki' });
    handlers.get('global-hotkey:pressed')?.({}, { action: 'terminal' });
    expect(openUki).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith('terminal');
    stop();
    expect(off).toHaveBeenCalledWith('global-hotkey:pressed', expect.any(Function));
  });

  it('passes a native refusal back as an error', async () => {
    (globalThis as { dex?: unknown }).dex = { invoke: vi.fn().mockResolvedValue({ error: 'Ctrl+Alt+D is already used for Show or hide DEX.' }) };
    expect(await setGlobalHotkey('ask-uki', { accelerator: 'Ctrl+Alt+D' })).toEqual({ error: 'Ctrl+Alt+D is already used for Show or hide DEX.' });
  });
});
