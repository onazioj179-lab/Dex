// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Renderer Terminal (xterm.js over a native pseudoterminal).
 * xterm.js needs a real layout engine, so it is replaced with a small fake that
 * records writes and lets the test emit keystrokes (onData) and resizes.
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

type Fn = (...a: any[]) => void;
const fake = vi.hoisted(() => ({
  instances: [] as any[],
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() { /* noop */ } } }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class { findNext() { return true; } findPrevious() { return true; } clearDecorations() { /* noop */ } } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 100; rows = 30;
    written: string[] = [];
    dataCb: Fn | null = null;
    resizeCb: Fn | null = null;
    buffer = { active: { length: 0, getLine: () => undefined } };
    constructor() { fake.instances.push(this); }
    loadAddon() { /* noop */ }
    open() { /* noop */ }
    write(d: string) { this.written.push(d); }
    onData(cb: Fn) { this.dataCb = cb; return { dispose() { /* noop */ } }; }
    onResize(cb: Fn) { this.resizeCb = cb; return { dispose() { /* noop */ } }; }
    attachCustomKeyEventHandler() { /* noop */ }
    hasSelection() { return false; }
    getSelection() { return ''; }
    clearSelection() { /* noop */ }
    focus() { /* noop */ }
    clear() { /* noop */ }
    reset() { /* noop */ }
    paste(t: string) { this.dataCb?.(t); }
    dispose() { /* noop */ }
  },
}));

const listeners: Record<string, Fn[]> = {};
const invokeCalls: Array<{ ch: string; args: any[] }> = [];

function mockBridge(spawnResult: { sessionId?: string; error?: string; shell?: string } = { sessionId: 'pty-1', shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' }) {
  (window as any).dex = {
    invoke: vi.fn(async (ch: string, ...args: any[]) => {
      invokeCalls.push({ ch, args });
      if (ch === 'pty:spawn') return spawnResult;
      return { success: true };
    }),
    on: (ch: string, l: Fn) => {
      (listeners[ch] = listeners[ch] || []).push(l);
      return () => { listeners[ch] = (listeners[ch] || []).filter(x => x !== l); };
    },
  };
}
const push = (ch: string, p: unknown) => { for (const l of listeners[ch] || []) l(p); };
const tick = () => new Promise(r => setTimeout(r, 0));
const term = () => fake.instances[fake.instances.length - 1];
const writes = () => invokeCalls.filter(c => c.ch === 'pty:write').map(c => c.args[0].data);

beforeEach(() => {
  invokeCalls.length = 0;
  fake.instances.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  mockBridge();
});

async function mount(props: Record<string, unknown> = {}) {
  const { Terminal } = await import('../../src/renderer/components/Terminal');
  await act(async () => { render(<Terminal {...props} />); await tick(); });
}

describe('Terminal (pseudoterminal)', () => {
  it('spawns a session sized to the terminal grid', async () => {
    await mount({ cwd: 'C:\\work' });
    const spawn = invokeCalls.find(c => c.ch === 'pty:spawn');
    expect(spawn?.args[0]).toMatchObject({ cwd: 'C:\\work', cols: 100, rows: 30 });
    expect(screen.getByTestId('dex-terminal').getAttribute('data-session-id')).toBe('pty-1');
    expect(screen.getByTestId('dex-terminal').textContent).toContain('pwsh');
  });

  it('writes shell output into xterm unchanged (escape sequences included)', async () => {
    await mount();
    await act(async () => { push('pty:data', { sessionId: 'pty-1', data: '\x1b[32mhi\x1b[0m\r\n' }); });
    await act(async () => { push('pty:data', { sessionId: 'other', data: 'not mine' }); });
    expect(term().written).toEqual(['\x1b[32mhi\x1b[0m\r\n']);
  });

  it('forwards every keystroke to the shell as typed', async () => {
    await mount();
    await act(async () => { for (const k of ['l', 's', '\x1b[A', '\r']) term().dataCb(k); await tick(); });
    expect(writes()).toEqual(['l', 's', '\x1b[A', '\r']);
  });

  it('resizes the pseudoconsole when xterm is refitted', async () => {
    await mount();
    await act(async () => { term().resizeCb({ cols: 132, rows: 40 }); await tick(); });
    expect(invokeCalls.find(c => c.ch === 'pty:resize')?.args[0]).toEqual({ sessionId: 'pty-1', cols: 132, rows: 40 });
  });

  it('runs a typed `dex` line locally and discards it from the shell', async () => {
    await mount();
    await act(async () => { for (const k of 'dex list') term().dataCb(k); term().dataCb('\r'); await tick(); });
    const w = writes();
    expect(w.join('')).toBe('dex list' + (/win/i.test(navigator.platform) ? '\x1b' : '\x15'));
    expect(w).not.toContain('\r');
    expect(screen.getByLabelText('DEX command result').textContent).toContain('dex list');
  });

  it('reports the entered command for tab titles', async () => {
    const onRunningCommand = vi.fn();
    await mount({ onRunningCommand });
    await act(async () => { for (const k of 'git status') term().dataCb(k); term().dataCb('\r'); await tick(); });
    expect(onRunningCommand).toHaveBeenCalledWith('git status');
  });

  it('shows the exit code and offers a restart', async () => {
    await mount();
    await new Promise(r => setTimeout(r, 1600)); // past the fast-exit window
    await act(async () => { push('pty:exit', { sessionId: 'pty-1', code: 0 }); await tick(); });
    expect(term().written.join('')).toContain('exited with code 0');
    expect(screen.getByLabelText('Restart terminal')).toBeTruthy();
  });

  it('shows the native error when the shell cannot start', async () => {
    mockBridge({ error: 'Maximum 16 terminal sessions reached.' });
    await mount();
    expect(screen.getByTestId('dex-terminal').textContent).toContain('Maximum 16 terminal sessions reached.');
  });

  it('unsubscribes with dex.off when on() returns nothing (the real Tauri bridge)', async () => {
    const off = vi.fn();
    const dex = (window as any).dex;
    dex.on = (ch: string, l: Fn) => { (listeners[ch] = listeners[ch] || []).push(l); return undefined; };
    dex.off = off;
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    let unmount!: () => void;
    await act(async () => { ({ unmount } = render(<Terminal />)); await tick(); });
    act(() => unmount());
    expect(off.mock.calls.map(c => c[0]).sort()).toEqual(['pty:data', 'pty:exit']);
  });

  it('kills the session on unmount', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    let unmount!: () => void;
    await act(async () => { ({ unmount } = render(<Terminal />)); await tick(); });
    act(() => unmount());
    expect(invokeCalls.find(c => c.ch === 'pty:kill')?.args[0]).toEqual({ sessionId: 'pty-1' });
  });
});
