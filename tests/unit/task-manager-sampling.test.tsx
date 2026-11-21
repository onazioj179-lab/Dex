import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskManager from '../../src/renderer/pages/TaskManager';
import { sharedTick } from '../../src/renderer/services/SharedTick';
import { useRunningApps } from '../../src/renderer/store/runningApps';

const initialApps = useRunningApps.getState();

beforeEach(() => {
  localStorage.clear();
  useRunningApps.setState({ currentAppId: 'taskmanager' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useRunningApps.setState(initialApps);
});

describe('Task Manager sampling', () => {
  it('uses the native process total and distinguishes missing from zero CPU samples', async () => {
    vi.stubGlobal('dex', { system: {
      getStatus: vi.fn().mockResolvedValue({ success: true, cpu: { usage: 0, cores: 8 } }),
      getProcesses: vi.fn().mockResolvedValue({ success: true, total: 542, processes: [{ pid: 32, name: 'Example' }] }),
    } });
    render(<TaskManager />);
    expect(await screen.findByText('542')).toBeTruthy();
    expect(screen.getByText('0.0%')).toBeTruthy();
    expect(screen.getAllByText('Waiting for a system sample').length).toBeGreaterThan(0);
  });

  it('keeps process availability independent from metric failures and stops sampling when unfocused', async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error('native metrics unavailable'));
    const getProcesses = vi.fn().mockResolvedValue({ success: true, total: 27, processes: [] });
    vi.stubGlobal('dex', { system: { getStatus, getProcesses } });
    render(<TaskManager />);
    expect(await screen.findByText('27')).toBeTruthy();
    expect(screen.getAllByText('System samples unavailable').length).toBeGreaterThan(0);
    expect(sharedTick.getStats().subscribers.some(item => item.id.endsWith('-processes'))).toBe(true);
    act(() => useRunningApps.setState({ currentAppId: 'home' }));
    expect(sharedTick.getStats().subscribers.some(item => item.id.endsWith('-processes'))).toBe(false);
  });

  it('retains the last process sample and disables actions after a failed refresh', async () => {
    const getProcesses = vi.fn()
      .mockResolvedValueOnce({ success: true, processes: [{ pid: 42, name: 'Example', instance: '100' }] })
      .mockResolvedValue({ success: false });
    vi.stubGlobal('dex', { system: { getProcesses, getStatus: async () => ({ success: true }) } });
    render(<TaskManager observing />);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    const end = await screen.findByRole('button', { name: 'End process Example' });
    expect(end).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Task Manager' }));
    expect(await screen.findByText('Could not refresh processes. Showing the last sample.')).toBeVisible();
    expect(end).toBeDisabled();
    expect(screen.getByText('Example')).toBeVisible();
  });

  it('drops a confirmation and pin when the same PID belongs to a different instance', async () => {
    const getProcesses = vi.fn()
      .mockResolvedValueOnce({ success: true, processes: [{ pid: 42, name: 'Example', instance: '100' }] })
      .mockResolvedValue({ success: true, processes: [{ pid: 42, name: 'Example', instance: '101' }] });
    const invoke = vi.fn();
    vi.stubGlobal('dex', { invoke, system: { getProcesses, getStatus: async () => ({ success: true }) } });
    render(<TaskManager observing />);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pin Example to watch list' }));
    fireEvent.click(screen.getByRole('button', { name: 'End process Example' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh Task Manager' })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'End Process' }));
    expect(await screen.findByText('The selected process has changed. Select it again.')).toBeVisible();
    expect(invoke).not.toHaveBeenCalledWith('system:endObservedProcess', expect.anything());
    expect(screen.getByRole('button', { name: 'Pin Example to watch list' })).toBeVisible();
  });

  it('reports a native action failure without offering a force retry', async () => {
    const getProcesses = vi.fn().mockResolvedValue({ success: true, processes: [{ pid: 42, name: 'Example', instance: '100' }] });
    const invoke = vi.fn().mockResolvedValue({ success: false, error: 'Windows denied access.' });
    vi.stubGlobal('dex', { invoke, system: { getProcesses, getStatus: async () => ({ success: true }) } });
    render(<TaskManager observing />);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    fireEvent.click(await screen.findByRole('button', { name: 'End process tree Example' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'End Tree' }));
    expect(await screen.findByText('Windows denied access.')).toBeVisible();
    expect(invoke).toHaveBeenCalledWith('system:endObservedProcess', { pid: 42, instance: '100', tree: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
