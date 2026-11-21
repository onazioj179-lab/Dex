// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioControl } from '../../src/renderer/pages/AudioControl';

const ready = {
  success: true,
  outputs: [{ id: 'speaker', name: 'Desktop speakers', master: { volume: 40, muted: false } }],
  sessions: [],
  currentOutput: 'speaker',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Sound settings', () => {
  it('retains its last known device list until refresh recovers', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({ success: false, error: 'Audio service disconnected.' })
      .mockResolvedValue(ready);
    vi.stubGlobal('dex', { invoke });
    render(<AudioControl />);
    const slider = await screen.findByRole('slider', { name: 'Default output volume' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh audio' }));
    expect(await screen.findByText('Audio service disconnected. Showing the last device list.')).toBeVisible();
    expect(screen.getByText('Desktop speakers')).toBeVisible();
    expect(slider).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh audio' }));
    await waitFor(() => expect(slider).toBeEnabled());
  });

  it('restores the hardware volume and preserves a failed write message after refresh', async () => {
    const invoke = vi.fn(async (channel: string) => channel === 'audio-control:change'
      ? { success: false, error: 'Volume change was denied.' } : ready);
    vi.stubGlobal('dex', { invoke });
    render(<AudioControl />);
    const slider = await screen.findByRole('slider', { name: 'Default output volume' });
    fireEvent.change(slider, { target: { value: '67' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Volume change was denied.');
    expect(invoke).toHaveBeenCalledWith('audio-control:change', 'speaker', null, 'volume', 67);
    await waitFor(() => expect(slider).toBeEnabled());
    expect(slider).toHaveValue('40');
  });
});
