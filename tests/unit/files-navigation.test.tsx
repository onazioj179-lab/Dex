// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
