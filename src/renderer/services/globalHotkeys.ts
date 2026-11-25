// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * System-wide shortcuts (renderer half). The native side
 * (src-tauri/src/global_hotkeys.rs) registers the keys with Windows, brings
 * DEX to the front on a press and sends `global-hotkey:pressed { action }`;
 * this routes the action to the same handlers the in-app keys use.
 */

import { DEX_COMMAND_EVENT } from './dexCommandRunner';
import { dispatchAppIntent } from './appIntents';

export interface GlobalHotkey {
  action: string;
  label: string;
  accelerator: string;
  default: string;
  enabled: boolean;
  registered: boolean;
  error: string | null;
}
export interface GlobalHotkeyState {
  enabled: boolean;
  supported: boolean;
  bindings: GlobalHotkey[];
}

type Bridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on?: (channel: string, fn: (...args: unknown[]) => void) => unknown;
  off?: (channel: string, fn: (...args: unknown[]) => void) => void;
};

function bridge(): Bridge | null {
  const dex = (globalThis as unknown as { dex?: Bridge }).dex;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}

function asState(v: unknown): GlobalHotkeyState | { error: string } | null {
  if (!v || typeof v !== 'object') return null;
  if ('error' in v && typeof (v as { error: unknown }).error === 'string') return { error: (v as { error: string }).error };
  const s = v as Partial<GlobalHotkeyState>;
  if (!Array.isArray(s.bindings)) return null;
  return { enabled: s.enabled !== false, supported: s.supported !== false, bindings: s.bindings as GlobalHotkey[] };
}

export async function listGlobalHotkeys(): Promise<GlobalHotkeyState | null> {
  const b = bridge();
  if (!b) return null;
  const r = asState(await b.invoke('global-hotkeys:list').catch(() => null));
  return r && !('error' in r) ? r : null;
}

/** Change one binding. Resolves to the new state, or `{ error }` (e.g. a duplicate key). */
export async function setGlobalHotkey(action: string, change: { accelerator?: string; enabled?: boolean }): Promise<GlobalHotkeyState | { error: string }> {
  const b = bridge();
  if (!b) return { error: 'System-wide shortcuts need the DEX desktop app.' };
  return asState(await b.invoke('global-hotkeys:set', { action, ...change }).catch((e) => ({ error: String(e) })))
    ?? { error: 'No answer from DEX.' };
}

export async function setGlobalHotkeysEnabled(enabled: boolean): Promise<GlobalHotkeyState | null> {
  const b = bridge();
  if (!b) return null;
  const r = asState(await b.invoke('global-hotkeys:setEnabled', { enabled }).catch(() => null));
  return r && !('error' in r) ? r : null;
}

export async function resetGlobalHotkeys(): Promise<GlobalHotkeyState | null> {
  const b = bridge();
  if (!b) return null;
  const r = asState(await b.invoke('global-hotkeys:reset').catch(() => null));
  return r && !('error' in r) ? r : null;
}

/** Turn a keydown into an accelerator ("Ctrl+Alt+K"), or null while only modifiers are held. */
export function acceleratorFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph'].includes(e.key)) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
  else if (e.code === 'Space') key = 'Space';
  else if (e.key.startsWith('Arrow')) key = e.key.slice(5);
  else {
    const named: Record<string, string> = {
      Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
      BracketLeft: '[', BracketRight: ']', Backslash: '\\', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
      Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    };
    const n = named[e.code];
    if (!n) return null;
    key = n;
  }
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean) as string[];
  return [...mods, key].join('+');
}

export interface HotkeyActionTargets {
  openUki: () => void;
  openSearch: () => void;
  openClipboard: () => void;
  newNote: () => void;
  openTerminal: () => void;
}

/** Route a pressed action (pure, for tests). Returns false for an unknown action. */
export function runGlobalHotkeyAction(action: string, t: HotkeyActionTargets): boolean {
  switch (action) {
    case 'ask-uki': t.openUki(); return true;
    case 'search': t.openSearch(); return true;
    case 'clipboard': t.openClipboard(); return true;
    case 'new-note': t.newNote(); return true;
    case 'terminal': t.openTerminal(); return true;
    default: return false;
  }
}

/** Listen for presses for the life of the shell. `launch` opens a DEX app by id. */
export function startGlobalHotkeyListener(launch: (appId: string) => void, openUki: () => void): () => void {
  const b = bridge();
  if (!b?.on) return () => {};
  const targets: HotkeyActionTargets = {
    openUki,
    openSearch: () => window.dispatchEvent(new CustomEvent(DEX_COMMAND_EVENT, { detail: { action: 'appMenu' } })),
    openClipboard: () => window.dispatchEvent(new CustomEvent('dex-open-clipboard')),
    newNote: () => { launch('notes'); dispatchAppIntent('notes', 'new-note'); },
    openTerminal: () => launch('terminal'),
  };
  const fn = (...args: unknown[]) => {
    const p = args[args.length - 1] as { action?: unknown } | undefined;
    if (p && typeof p.action === 'string') runGlobalHotkeyAction(p.action, targets);
  };
  const ret = b.on('global-hotkey:pressed', fn);
  return () => {
    if (typeof ret === 'function') (ret as () => void)();
    else b.off?.('global-hotkey:pressed', fn);
  };
}
