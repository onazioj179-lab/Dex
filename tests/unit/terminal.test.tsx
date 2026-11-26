// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Smoke tests for the renderer Terminal component.
 * Exercises ANSI parsing, IPC spawn round-trip, input/output flow, and
 * keyboard shortcuts (Enter sends, Ctrl+L clears, ArrowUp recalls history).
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const listenFromWindow = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({ listen: listenFromWindow }),
}));

// ----- IPC mock plumbing ---------------------------------------------------
type Listener = (...args: unknown[]) => void;
const listeners: Record<string, Listener[]> = {};
const invokeCalls: Array<{ ch: string; args: unknown[] }> = [];

type SpawnResponse = { sessionId?: string; error?: string } | null;
function mockBridge(spawnResult: SpawnResponse | Promise<SpawnResponse> = { sessionId: 'pty-1' }) {
  (window as unknown as { electron: unknown }).electron = {
    invoke: vi.fn(async (ch: string, ...args: unknown[]) => {
      invokeCalls.push({ ch, args });
      if (ch === 'pty:spawn') return spawnResult;
      return { success: true };
    }),
    on: (ch: string, listener: Listener) => {
      (listeners[ch] = listeners[ch] || []).push(listener);
      return () => {
        listeners[ch] = (listeners[ch] || []).filter(l => l !== listener);
      };
    },
  };
}

function pushEvent(channel: string, payload: unknown) {
  for (const l of listeners[channel] || []) l(payload);
}

beforeEach(() => {
  invokeCalls.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  mockBridge();
});
afterEach(() => vi.unstubAllGlobals());

describe('Terminal', () => {
  it('spawns a session on mount', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      // microtask for invoke promise
      await new Promise(r => setTimeout(r, 0));
    });
    expect(invokeCalls.find(c => c.ch === 'pty:spawn')).toBeTruthy();
    expect(screen.getByTestId('dex-terminal')).toBeTruthy();
  });

  it('reclaims a pending session after the terminal unmounts', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    let completeSpawn: (response: SpawnResponse) => void = () => {};
    mockBridge(new Promise(resolve => { completeSpawn = resolve; }));
    const { unmount } = render(<Terminal />);
    unmount();
    await act(async () => completeSpawn({ sessionId: 'late-session' }));
    expect(invokeCalls).toContainEqual({ ch: 'pty:kill', args: [{ sessionId: 'late-session' }] });
  });

  it('reports a native response without a session', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    mockBridge(null);
    render(<Terminal />);
    expect(await screen.findByText('The terminal did not return a session.', { exact: false })).toBeTruthy();
  });

  it('renders incoming pty:data and strips ANSI color codes', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => {
      pushEvent('pty:data', { sessionId: 'pty-1', data: '\x1b[32mhello\x1b[0m world\r\n' });
    });
    // The text content of the body should contain "hello world" without any \x1b chars
    const term = screen.getByTestId('dex-terminal');
    await waitFor(() => expect(term.textContent).toContain('hello'));
    expect(term.textContent).toContain('world');
    expect(term.textContent).not.toContain('\x1b');
  });

  it('Enter on input sends pty:write with newline', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      await new Promise(r => setTimeout(r, 0));
    });
    const input = screen.getByLabelText('Terminal input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'echo hi' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await new Promise(r => setTimeout(r, 0));
    });
    const writeCall = invokeCalls.find(c => c.ch === 'pty:write');
    expect(writeCall).toBeTruthy();
    expect((writeCall!.args[0] as { data: string }).data.startsWith('echo hi')).toBe(true);
  });

  it('Ctrl+L clears the terminal output area', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => {
      pushEvent('pty:data', { sessionId: 'pty-1', data: 'one\r\ntwo\r\n' });
    });
    const term = screen.getByTestId('dex-terminal');
    await waitFor(() => expect(term.textContent).toContain('one'));
    const input = screen.getByLabelText('Terminal input') as HTMLInputElement;
    await act(async () => {
      fireEvent.keyDown(input, { key: 'l', ctrlKey: true });
    });
    expect(term.textContent).not.toContain('one');
  });

  it('ArrowUp recalls previous command from history', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      await new Promise(r => setTimeout(r, 0));
    });
    const input = screen.getByLabelText('Terminal input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'first' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await new Promise(r => setTimeout(r, 0));
    });
    fireEvent.change(input, { target: { value: 'second' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await new Promise(r => setTimeout(r, 0));
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
    expect(input.value).toBe('second');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
    expect(input.value).toBe('first');
  });

  it('shows error UI when spawn returns error', async () => {
    mockBridge({ error: 'Maximum sessions reached.' });
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    await act(async () => {
      render(<Terminal />);
      await new Promise(r => setTimeout(r, 0));
    });
    const term = screen.getByTestId('dex-terminal');
    expect(term.textContent).toContain('Maximum sessions reached.');
  });

  it('attaches listeners before spawning and retains immediate native output and exit', async () => {
    const { Terminal } = await import('../../src/renderer/components/Terminal');
    const nativeEvents = new Map<string, (event: { payload: unknown }) => void>();
    const order: string[] = [];
    listenFromWindow.mockImplementation(async (name: string, listener: (event: { payload: unknown }) => void) => {
      order.push(`listen:${name}`);
      nativeEvents.set(name, listener);
      return () => nativeEvents.delete(name);
    });
    vi.stubGlobal('__TAURI__', { core: { invoke: vi.fn() } });
    const invoke = vi.fn(async (channel: string, _options: unknown) => {
      order.push(channel);
      if (channel === 'pty:spawn') return { sessionId: 'early', interactive: true };
      if (channel === 'pty:attach') {
        nativeEvents.get('pty:data')?.({ payload: { sessionId: 'early', data: 'startup output\r\n' } });
        nativeEvents.get('pty:exit')?.({ payload: { sessionId: 'early', code: 0 } });
      }
      return { success: true };
    });
    (window as unknown as { electron: unknown }).electron = { invoke };
    render(<Terminal cwd="C:/Project" />);
    expect(await screen.findByText('startup output')).toBeTruthy();
    expect(screen.getByText('[session exited code=0]')).toBeTruthy();
    expect(order.slice(0, 4)).toEqual(['listen:pty:data', 'listen:pty:exit', 'pty:spawn', 'pty:attach']);
    expect(invoke).toHaveBeenCalledWith('pty:spawn', expect.objectContaining({ cwd: 'C:/Project', deferEvents: true }));
  });

  it('restores terminals lazily and opens a split without restarting the first session', async () => {
    const { TerminalTabs } = await import('../../src/renderer/components/TerminalTabs');
    localStorage.setItem('dex.terminal.tabs.v1', JSON.stringify({
      tabs: [{ id: 't1', cwd: 'C:/First' }, { id: 't2', cwd: 'C:/Second' }, { id: 't3', cwd: 'C:/Third' }],
      activeId: 't1', nextNum: 4,
    }));
    const { unmount } = render(<TerminalTabs cwd="C:/Default" />);
    await waitFor(() => expect(invokeCalls.filter(call => call.ch === 'pty:spawn')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(2);
    await waitFor(() => expect(invokeCalls.filter(call => call.ch === 'pty:spawn').map(call => call.args[0]))
      .toEqual([expect.objectContaining({ cwd: 'C:/First' }), expect.objectContaining({ cwd: 'C:/Second' })]));
    const firstTerminal = screen.getAllByTestId('dex-terminal')[0];
    fireEvent.click(screen.getByRole('button', { name: 'Split terminal' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getAllByTestId('dex-terminal')[0]).toBe(firstTerminal);
    expect(invokeCalls.some(call => call.ch === 'pty:kill')).toBe(false);
    unmount();
    localStorage.removeItem('dex.terminal.tabs.v1');
  });

  it('applies a selected installed shell profile to new sessions only', async () => {
    const { TerminalTabs } = await import('../../src/renderer/components/TerminalTabs');
    localStorage.removeItem('dex.terminal.tabs.v1');
    const electron = window.electron as unknown as { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
    const original = electron.invoke;
    electron.invoke = async (channel, ...args) => channel === 'pty:listProfiles'
      ? { profiles: [{ label: 'PowerShell 7', shell: 'C:/Trusted/pwsh.exe' }] }
      : original(channel, ...args);
    const { unmount } = render(<TerminalTabs cwd="C:/Current" />);
    const profile = await screen.findByRole('combobox', { name: 'Shell for new terminals' });
    fireEvent.change(profile, { target: { value: 'C:/Trusted/pwsh.exe' } });
    fireEvent.click(screen.getByRole('button', { name: 'New terminal session' }));
    await waitFor(() => expect(invokeCalls.filter(call => call.ch === 'pty:spawn').map(call => call.args[0]))
      .toEqual([
        expect.objectContaining({ cwd: 'C:/Current', shell: undefined }),
        expect.objectContaining({ cwd: 'C:/Current', shell: 'C:/Trusted/pwsh.exe' }),
      ]));
    unmount();
    localStorage.removeItem('dex.terminal.tabs.v1');
  });
});
