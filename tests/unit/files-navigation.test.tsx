// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Files } from '../../src/renderer/pages/Files';
import { ToastProvider } from '../../src/renderer/components/Toast';

const entry = (name: string, hidden = false) => ({
  name, path: 'C:/Test/' + name, extension: '.md', isDirectory: false, size: 5, hidden,
  modified: '2026-11-21T05:00:00.000Z',
});
const listing = (...files: ReturnType<typeof entry>[]) => ({ success: true, path: 'C:/Test', files });
const mount = () => render(<ToastProvider><Files /></ToastProvider>);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('applies the file search and hidden setting to Recent Files', async () => {
  vi.stubGlobal('dex', {
    invoke: vi.fn(async (channel: string) => channel === 'files:list'
      ? listing(entry('draft.md'), entry('summary.md'), entry('.draft-private.md', true))
      : null),
  });
  mount();
  await screen.findByText('summary.md');
  fireEvent.click(screen.getByRole('button', { name: 'Recent files' }));
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'draft' } });
  expect(screen.getByText('draft.md')).toBeVisible();
  expect(screen.queryByText('summary.md')).toBeNull();
  expect(screen.queryByText('.draft-private.md')).toBeNull();
});

it('ignores a stale folder response after moving to a new location', async () => {
  let finishDocuments!: (value: ReturnType<typeof listing>) => void;
  const invoke = vi.fn(async (channel: string, path: string) => {
    if (channel !== 'files:list') return null;
    if (path === 'documents') return new Promise<ReturnType<typeof listing>>(resolve => { finishDocuments = resolve; });
    return listing(entry('newer.md'));
  });
  vi.stubGlobal('dex', { invoke });
  mount();
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('files:list', 'documents'));
  fireEvent.click(screen.getByRole('button', { name: 'Downloads' }));
  expect(await screen.findByText('newer.md')).toBeVisible();
  await act(async () => finishDocuments(listing(entry('stale.md'))));
  expect(screen.getByText('newer.md')).toBeVisible();
  expect(screen.queryByText('stale.md')).toBeNull();
});


it('keeps separate folder histories and restores the neighboring tab when a tab closes', async () => {
  vi.stubGlobal('dex', {
    invoke: vi.fn(async (channel: string, path: string) => channel === 'files:list'
      ? { ...listing(entry(path + '.md')), path: 'C:/Test/' + path }
      : null),
  });
  mount();
  await screen.findByText('documents.md');
  fireEvent.click(screen.getByRole('button', { name: 'New folder tab' }));
  const folderTabs = within(screen.getByRole('group', { name: 'Folder tabs' }));
  expect(folderTabs.getAllByRole('button', { name: 'Documents', exact: true })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Downloads', exact: true }));
  expect(await screen.findByText('downloads.md')).toBeVisible();
  fireEvent.click(folderTabs.getByRole('button', { name: 'Documents', exact: true }));
  expect(await screen.findByText('documents.md')).toBeVisible();
  expect(folderTabs.getByRole('button', { name: 'Documents', exact: true })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(folderTabs.getByRole('button', { name: 'Close folder tab Documents' }));
  expect(await screen.findByText('downloads.md')).toBeVisible();
});

it('shows hidden files and reads disk usage through the existing native scan', async () => {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'files:list') return listing(entry('visible.md'), entry('.private.md', true));
    if (channel === 'fileIntel:groupByType') return { success: true, groups: [{ category: 'Text', count: 2, total_size: 10 }] };
    return null;
  });
  vi.stubGlobal('dex', { invoke });
  mount();
  await screen.findByText('visible.md');
  expect(screen.queryByText('.private.md')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show hidden files' }));
  expect(await screen.findByText('.private.md')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Storage by type' }));
  expect(await screen.findByText(/Text · .* · 2 files/)).toBeVisible();
  expect(invoke).toHaveBeenCalledWith('fileIntel:groupByType', 'C:/Test');
  fireEvent.click(screen.getByRole('button', { name: 'Show hidden files' }));
});
