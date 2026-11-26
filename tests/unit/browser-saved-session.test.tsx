// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Browser } from '../../src/renderer/pages/Browser';
import { ToastProvider } from '../../src/renderer/components/Toast';
import { useAppPreferences } from '../../src/renderer/store/appPreferences';
import { invokePlatformIpc } from '../../src/renderer/services/platform/ipc';
import type { NativePage } from '../../src/renderer/pages/browserPageWindows';

const pushed = vi.hoisted(() => new Map<string, Set<(payload: unknown) => void>>());

vi.mock('../../src/renderer/services/platform/tauriCompat', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  isTauri: () => true,
}));

vi.mock('../../src/renderer/services/platform/ipc', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  invokePlatformIpc: vi.fn(async () => null),
  subscribePlatformIpc: (name: string, handler: (payload: unknown) => void) => {
    const listeners = pushed.get(name) ?? new Set();
    pushed.set(name, listeners);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  },
}));

const key = 'dex-browser-session';
const invoke = vi.mocked(invokePlatformIpc);
const address = () => screen.getByPlaceholderText<HTMLInputElement>('Search or enter address');
const initialPage: NativePage = {
  tab: 'tab-one', instance: 5, revision: 2, status: 'open',
  title: 'Final article', url: 'https://example.org/final',
  canGoBack: true, canGoForward: false,
};
const send = (event: string, payload: unknown) => act(() => { pushed.get(event)?.forEach(listener => listener(payload)); });
const sendPage = (page: NativePage) => send('dex-browser-page-state', page);
const saved = (id: string, url: string, title: string) => ({ id, url, title });
const originalUrl = window.location.href;

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset().mockResolvedValue(null);
  useAppPreferences.setState({ loaded: true, apps: {} });
});
afterEach(() => {
  cleanup();
  pushed.clear();
  window.history.replaceState(null, '', originalUrl);
});

describe('Browser saved sessions on Tauri', () => {
  it.each([25, 50, 100, 250, 500])('restores and searches %i tab records without creating page views', async (count) => {
    const tabs = Array.from({ length: count }, (_, index) => ({
      id: `tab-${index}`,
      title: index + 1 === count ? 'Target article' : `Article ${index}`,
      url: `https://example.org/article/${index}`,
      pinned: index % 8 === 0,
    }));
    localStorage.setItem(key, JSON.stringify({ tabs, activeTab: 'tab-0' }));
    const view = render(<ToastProvider><Browser /></ToastProvider>);

    expect(screen.getByPlaceholderText('Search or enter address')).toHaveProperty('value', tabs[0].url);
    expect(view.container.querySelectorAll('webview, iframe')).toHaveLength(0);
    expect(view.container.querySelectorAll('[data-browser-tab]').length).toBeLessThan(35);
    const tabSearch = screen.getByLabelText('Search open tabs').closest('details')!;
    tabSearch.open = true;
    fireEvent.change(screen.getByPlaceholderText('Title or address'), { target: { value: 'target article' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Target article' }));

    expect(screen.getByPlaceholderText('Search or enter address')).toHaveProperty('value', tabs[count - 1].url);
    expect(view.container.querySelector(`[data-browser-tab="tab-${count - 1}"]`)).toBeTruthy();
    view.unmount();
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.tabs).toHaveLength(count);
    expect(saved.activeTab).toBe(tabs[count - 1].id);
  });

  it('starts fresh when restoration is disabled and preserves the saved session', () => {
    const saved = JSON.stringify({ tabs: [{ id: 'previous', url: 'https://example.org' }], activeTab: 'previous' });
    localStorage.setItem(key, saved);
    useAppPreferences.setState({ loaded: true, apps: { browser: { restoreTabs: false } } });
    const view = render(<ToastProvider><Browser /></ToastProvider>);
    expect(screen.getByPlaceholderText('Search or enter address')).toHaveProperty('value', '');
    view.unmount();
    expect(localStorage.getItem(key)).toBe(saved);
  });

  it('uses the live page address, title and engine navigation and ignores an older window event', async () => {
    localStorage.setItem(key, JSON.stringify({
      tabs: [saved('tab-one', 'https://example.org/start', 'Start')], activeTab: 'tab-one',
    }));
    invoke.mockImplementation(async channel => channel === 'browser:pageWindows'
      ? { success: true, pages: [initialPage] } : { success: true });
    const view = render(<ToastProvider><Browser /></ToastProvider>);
    await screen.findByRole('button', { name: 'Show web page window' });
    expect(address().value).toBe(initialPage.url);
    expect(screen.getAllByText('Final article').length).toBeGreaterThan(0);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Go forward' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }));
    expect(invoke).toHaveBeenCalledWith('browser:pageAction', 'tab-one', 'back');
    expect(invoke).toHaveBeenCalledWith('browser:pageAction', 'tab-one', 'reload');
    expect(invoke.mock.calls.some(([channel]) => channel === 'browser:openPageWindow')).toBe(false);

    act(() => { address().focus(); });
    fireEvent.change(address(), { target: { value: 'my next search' } });
    sendPage({ ...initialPage, revision: 3, title: 'Redirected article', url: 'https://example.org/redirected', canGoForward: true });
    expect(address().value).toBe('my next search');
    expect(screen.getAllByText('Redirected article').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
    expect(invoke).toHaveBeenCalledWith('browser:pageAction', 'tab-one', 'forward');
    sendPage({ ...initialPage, revision: 4, status: 'closed' });
    sendPage(initialPage);
    expect(screen.getByRole('button', { name: 'Open web page window' })).toBeTruthy();
    view.unmount();
    expect(JSON.parse(localStorage.getItem(key)!).tabs[0].url).toBe('https://example.org/redirected');
  });

  it('reports native load failures and retries without manufacturing a successful history entry', async () => {
    localStorage.setItem(key, JSON.stringify({
      tabs: [saved('tab-one', 'https://example.org/start', 'Start')], activeTab: 'tab-one',
    }));
    const errorPage = {
      ...initialPage, status: 'failed', error: 'The browser engine could not load this page.',
    };
    invoke.mockImplementation(async channel => channel === 'browser:pageWindows'
      ? { success: true, pages: [] } : { success: true, page: errorPage });
    render(<ToastProvider><Browser /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open web page window' }));
    expect(await screen.findByText(errorPage.error)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry opening page' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('browser:openPageWindow', 'tab-one', 'https://example.org/start', true));
    expect(JSON.parse(localStorage.getItem('dex-browser-history') ?? '[]')).toEqual([]);
  });

  it('keeps live windows during bulk close and closes the native window on explicit tab close', async () => {
    localStorage.setItem(key, JSON.stringify({
      tabs: [saved('tab-one', initialPage.url, initialPage.title), saved('tab-two', 'https://example.org/dormant', 'Dormant')],
      activeTab: 'tab-one',
    }));
    invoke.mockImplementation(async channel => channel === 'browser:pageWindows'
      ? { success: true, pages: [initialPage] } : { success: true });
    render(<ToastProvider><Browser /></ToastProvider>);
    await screen.findByRole('button', { name: 'Show web page window' });
    fireEvent.click(screen.getByRole('button', { name: 'Tab actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close All Tabs' }));
    expect(screen.queryByText('Dormant')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show web page window' })).toBeTruthy();
    expect(invoke.mock.calls.some(([channel]) => channel === 'browser:pageAction')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close tab' }));
    await waitFor(() => expect(address().value).toBe(''));
    expect(invoke).toHaveBeenCalledWith('browser:pageAction', 'tab-one', 'close');
  });

  it('restores detached Browser tabs without replacing the desktop session', () => {
    const desktop = JSON.stringify({ tabs: [saved('same-id', 'https://example.org/main', 'Desktop')], activeTab: 'same-id' });
    localStorage.setItem(key, desktop);
    localStorage.setItem(key + ':detached:browser', JSON.stringify({
      tabs: [saved('same-id', 'https://example.org/detached', 'Detached')], activeTab: 'same-id',
    }));
    window.history.replaceState(null, '', '/?detached=browser');
    const view = render(<ToastProvider><Browser /></ToastProvider>);
    expect(address().value).toBe('https://example.org/detached');
    view.unmount();
    expect(localStorage.getItem(key)).toBe(desktop);
  });

  it('opens the native Find bar only for the active supported page and scopes Ctrl+F to Browser', async () => {
    localStorage.setItem(key, JSON.stringify({
      tabs: [saved('tab-one', initialPage.url, initialPage.title), saved('tab-two', 'https://example.org/saved', 'Other tab')],
      activeTab: 'tab-one',
    }));
    invoke.mockImplementation(async channel => channel === 'browser:pageWindows'
      ? { success: true, pages: [{ ...initialPage, canFind: true }] } : { success: true });
    render(<ToastProvider><Browser /></ToastProvider>);
    const control = await screen.findByRole('button', { name: 'Find in page' });
    fireEvent.keyDown(document.body, { key: 'f', ctrlKey: true });
    expect(invoke.mock.calls.filter(([channel,, action]) => channel === 'browser:pageAction' && action === 'find')).toHaveLength(0);
    fireEvent.click(control);
    fireEvent.keyDown(address(), { key: 'f', ctrlKey: true });
    expect(invoke.mock.calls.filter(([channel,, action]) => channel === 'browser:pageAction' && action === 'find')).toEqual([
      ['browser:pageAction', 'tab-one', 'find'], ['browser:pageAction', 'tab-one', 'find'],
    ]);
    sendPage({ ...initialPage, revision: 3, status: 'closed', canFind: true });
    expect(screen.queryByRole('button', { name: 'Find in page' })).toBeNull();
  });

  it('requires choosing a destination, displays native progress and discards stale transfer events', async () => {
    const download = { id: 11, revision: 0, tab: 'tab-one', host: 'example.org', name: 'report.pdf', status: 'waiting', received: 0, total: null };
    invoke.mockImplementation(async channel => {
      if (channel === 'browser:pageWindows') return { success: true, pages: [] };
      if (channel === 'browser:downloads') return { success: true, supported: true, downloads: [download] };
      return { success: true };
    });
    render(<ToastProvider><Browser /></ToastProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Downloads' }));
    expect(screen.getByText('report.pdf')).toBeTruthy();
    expect(invoke.mock.calls.some(([channel]) => channel === 'browser:downloadAction')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('browser:downloadAction', 11, 'save'));
    send('dex-browser-download', { ...download, revision: 2, status: 'downloading', received: 20, total: 100 });
    send('dex-browser-download', download);
    expect(screen.queryByRole('button', { name: 'Choose location' })).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Download progress for report.pdf' })).toHaveProperty('value', 0.2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('browser:downloadAction', 11, 'cancel'));
    send('dex-browser-download', { ...download, revision: 3, status: 'canceled' });
    expect(screen.getByText('example.org · Canceled')).toBeTruthy();
  });
});
