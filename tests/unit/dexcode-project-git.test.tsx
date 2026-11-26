// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DexCode from '../../src/renderer/DEXAPPLICATIONS/standalone/DexCode';
import GitClient from '../../src/renderer/DEXAPPLICATIONS/standalone/GitClient';

const originalDex = Object.getOwnPropertyDescriptor(window, 'dex');
afterEach(() => {
  cleanup();
  localStorage.clear();
  if (originalDex) Object.defineProperty(window, 'dex', originalDex);
  else Reflect.deleteProperty(window, 'dex');
});

it('shows scoped Git status and both diff views, opens the editor file, and hands the repository to Git', async () => {
  localStorage.clear();
  const repositoryRoot = 'C:/Repository';
  const root = repositoryRoot + '/Workspace';
  const path = root + '/src/main.ts';
  const git = {
    check: vi.fn(async () => ({ available: true, version: 'git' })),
    status: vi.fn(async () => ({ isRepo: true, root: repositoryRoot, branch: 'main', files: [], ahead: 0, behind: 0 })),
    log: vi.fn(async () => []),
    branches: vi.fn(async () => ({ current: 'main', branches: ['main'] })),
  };
  let contents = 'line on disk';
  const invoke = vi.fn(async (channel: string, data?: { staged?: boolean; content?: string }): Promise<unknown> => {
    if (channel === 'codeProject:restore') return { success: true, root, writable: true, files: [{ name: 'src/main.ts', path }] };
    if (channel === 'codeProject:gitStatus') return {
      success: true, repositoryRoot, branch: 'main', limited: false,
      files: [{ path: 'src/main.ts', previousPath: null, index: 'M', work: 'M' }],
    };
    if (channel === 'codeProject:gitDiff') return { success: true, patch: data?.staged ? '+staged change' : '+working change', limited: false };
    if (channel === 'codeProject:openFile') return { success: true, document: { path, content: contents, revision: 'before' } };
    if (channel === 'codeProject:saveFile') {
      contents = data?.content ?? '';
      return { success: true, revision: 'after' };
    }
    return null;
  });
  Object.defineProperty(window, 'dex', { configurable: true, value: { invoke, git } });
  render(<><DexCode /><GitClient /></>);
  await screen.findByRole('button', { name: 'src/main.ts' });
  expect(invoke.mock.calls.some(([channel]) => channel === 'codeProject:gitStatus')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Git' }));
  const panel = within(screen.getByRole('region', { name: 'Project Git' }));
  const file = await panel.findByRole('button', { name: 'src/main.ts, Staged modified, Working tree modified' });
  expect(invoke).toHaveBeenCalledWith('codeProject:gitStatus', { root });
  fireEvent.click(file);
  expect(await panel.findByText('+working change')).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: 'Staged' }));
  expect(await panel.findByText('+staged change')).toBeTruthy();
  expect(invoke).toHaveBeenCalledWith('codeProject:gitDiff', { root, path: 'src/main.ts', previousPath: null, staged: true });
  fireEvent.click(panel.getByRole('button', { name: 'Open file' }));
  await waitFor(() => expect(screen.getByLabelText<HTMLTextAreaElement>('DexScript code editor').value).toBe('line on disk'));
  const active = screen.getByLabelText<HTMLTextAreaElement>('DexScript code editor');
  fireEvent.change(active, { target: { value: 'updated in editor' } });
  fireEvent.keyDown(active, { key: 's', ctrlKey: true });
  await waitFor(() => expect(invoke.mock.calls.filter(([channel]) => channel === 'codeProject:gitStatus')).toHaveLength(2));
  fireEvent.click(await panel.findByRole('button', { name: 'Open Git app' }));
  await waitFor(() => expect(git.status).toHaveBeenCalledWith(repositoryRoot));
  expect(screen.getByLabelText<HTMLInputElement>('Repository path').value).toBe(repositoryRoot);
});
