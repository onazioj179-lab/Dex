// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gallery from '../../src/renderer/pages/Gallery';
import { ToastProvider } from '../../src/renderer/components/Toast';
import { DEFAULT_GALLERY_EDITS, galleryEditFrame } from '../../src/renderer/pages/galleryEdits';

const invoke = vi.fn();
const photos = [
  { path: 'C:\\Photos\\First #1.png', name: 'First #1.png', extension: '.png', modified: 400 },
  { path: 'C:\\Photos\\Second #2.jpg', name: 'Second #2.jpg', extension: '.jpg', modified: 300 },
];
function openGallery() {
  return render(<ToastProvider><Gallery /></ToastProvider>);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  vi.stubGlobal('__TAURI_INTERNALS__', {
    convertFileSrc: (path: string) => 'http://asset.localhost/' + encodeURIComponent(path),
  });
  vi.stubGlobal('electron', { invoke });
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string) => (
    channel === 'gallery:mediaLibrary' ? { success: true, items: photos } : null
  ));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Gallery local media and edits', () => {
  it('loads desktop asset URLs and keeps each photo’s stored edits when navigating', async () => {
    localStorage.setItem('dex-gallery-adj-' + photos[0].path, '{"e":31}');
    localStorage.setItem('dex-gallery-adj-' + photos[1].path, '{"e":-12}');
    openGallery();

    const first = await screen.findByRole('img', { name: photos[0].name });
    expect(first).toHaveAttribute('src', 'http://asset.localhost/' + encodeURIComponent(photos[0].path));
    fireEvent.click(first);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust photo' }));
    expect(screen.getByRole('slider', { name: 'Exposure' })).toHaveValue('31');
    fireEvent.change(screen.getByRole('slider', { name: 'Exposure' }), { target: { value: '47' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next media' }));
    expect(screen.getByRole('slider', { name: 'Exposure' })).toHaveValue('-12');
    fireEvent.click(screen.getByRole('button', { name: 'Previous media' }));
    expect(screen.getByRole('slider', { name: 'Exposure' })).toHaveValue('47');
    expect(JSON.parse(localStorage.getItem('dex-gallery-adj-' + photos[1].path)!)).toEqual({ e: -12 });
  });

  it('refreshes after a native import and lets the user retry a failed scan', async () => {
    let scans = 0;
    invoke.mockImplementation(async (channel: string) => {
      if (channel === 'gallery:mediaLibrary') {
        scans += 1;
        if (scans === 1) return { success: false, error: 'Gallery disk temporarily unavailable' };
        return { success: true, items: scans === 2 ? photos.slice(0, 1) : photos };
      }
      if (channel === 'gallery:importMedia') return { success: true, count: 1 };
      return null;
    });
    openGallery();
    expect(await screen.findByRole('alert')).toHaveTextContent('Gallery disk temporarily unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('img', { name: photos[0].name });
    fireEvent.click(screen.getByRole('button', { name: 'Import', exact: true }));
    expect(await screen.findByRole('img', { name: photos[1].name })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import', exact: true })).toBeEnabled());
  });

  it('shows retry when the library request times out', async () => {
    vi.useFakeTimers();
    invoke.mockImplementation((channel: string) =>
      channel === 'gallery:mediaLibrary' ? new Promise(() => {}) : Promise.resolve(null));
    openGallery();
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('uses the same centered output dimensions for a rotated and cropped image', () => {
    const rotation = { ...DEFAULT_GALLERY_EDITS, rotation: 90, flipX: true };
    expect(galleryEditFrame(120, 60, rotation)).toMatchObject({ width: 60, height: 120, flipX: -1 });
    expect(galleryEditFrame(120, 60, { ...rotation, crop: '1:1' })).toMatchObject({ width: 60, height: 60 });
    expect(galleryEditFrame(120, 60, { ...DEFAULT_GALLERY_EDITS, straighten: 10 })).toMatchObject({ width: 129, height: 80 });
  });
});
