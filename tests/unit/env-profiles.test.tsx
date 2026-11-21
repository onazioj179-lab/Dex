// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EnvManager from '../../src/renderer/DEXAPPLICATIONS/standalone/EnvManager';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('preserves legacy required keys and edits and links each profile independently', async () => {
  localStorage.setItem('dex.envManager.requiredKeys.v1', JSON.stringify(['LEGACY']));
  localStorage.setItem('dex.envManager.profiles.v1', JSON.stringify([
    { id: 'dev', name: 'Dev', entries: [] },
    { id: 'prod', name: 'Production', entries: [] },
  ]));
  const invoke = vi.fn(async () => ({ canceled: false, filePaths: ['C:/Projects/Example'] }));
  vi.stubGlobal('dex', {
    invoke,
    env: {
      listSystem: vi.fn(async () => []),
      getManaged: vi.fn(async () => ({ global: {}, apps: {} })),
    },
  });
  const select = () => screen.getByRole('combobox', { name: 'Scope' });
  const view = render(<EnvManager />);
  fireEvent.change(select(), { target: { value: 'profile:dev' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove required LEGACY' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Add required key' }), { target: { value: 'API_URL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add required', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Link project folder' }));
  expect(await screen.findByText('C:/Projects/Example')).toBeVisible();
  fireEvent.change(select(), { target: { value: 'profile:prod' } });
  expect(screen.getByRole('button', { name: 'Remove required LEGACY' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Remove required API_URL' })).toBeNull();
  expect(screen.queryByText('C:/Projects/Example')).toBeNull();
  view.unmount();
  await act(async () => { render(<EnvManager />); });
  fireEvent.change(select(), { target: { value: 'profile:dev' } });
  expect(screen.getByRole('button', { name: 'Remove required API_URL' })).toBeVisible();
  expect(screen.getByText('C:/Projects/Example')).toBeVisible();
});
