// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAudioPreview } from '../../src/renderer/components/LocalAudioPreview';
import { QuickLookVideo, useVideoPreview } from '../../src/renderer/components/VideoPreview';
import { closePiP, openPiP } from '../../src/renderer/components/PictureInPicture';

const invoke = vi.fn();
const source = 'C:\\Music\\Outside the codec.aiff';
const prepared = 'C:\\Temp\\preview.wav';

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  vi.stubGlobal('__TAURI_INTERNALS__', {
    convertFileSrc: (path: string) => 'http://asset.localhost/' + encodeURIComponent(path),
  });
  vi.stubGlobal('electron', { invoke });
});

describe('Local video previews', () => {
  const path = 'C:\\Video\\Recording.avi';
  const original = 'http://asset.localhost/recording.avi';
  const compatible = 'C:\\Temp\\preview.mp4';

  it('keeps the temporary source until Picture in Picture closes', async () => {
    invoke.mockImplementation(async channel => channel === 'media:prepareVideo'
      ? { success: true, path: compatible }
      : { success: true });
    const { result, unmount } = renderHook(() => useVideoPreview(original, path));
    expect(result.current.source).toBe(original);
    expect(invoke).not.toHaveBeenCalled();
    act(() => result.current.onError());
    await waitFor(() => expect(result.current.source).toBe('http://asset.localhost/' + encodeURIComponent(compatible)));
    const token = invoke.mock.calls[0][1];
    expect(invoke).toHaveBeenCalledWith('media:prepareVideo', token, path);
    openPiP(result.current.source!, 'Recording', undefined, result.current.retain());
    unmount();
    expect(invoke).not.toHaveBeenCalledWith('media:releaseVideo', token);
    closePiP();
    expect(invoke).toHaveBeenCalledWith('media:releaseVideo', token);
  });

  it('cancels preparation and discards a late response', async () => {
    let finish: (result: { success: boolean; path: string }) => void = () => {};
    invoke.mockImplementation(channel => channel === 'media:prepareVideo'
      ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve({ success: true }));
    const { container } = render(<QuickLookVideo url={original} path={path} onOpen={() => {}} />);
    fireEvent.error(container.querySelector('video')!);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing video');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => finish({ success: true, path: compatible }));
    const token = invoke.mock.calls[0][1];
    expect(invoke.mock.calls.filter(([channel]) => channel === 'media:releaseVideo')).toEqual([
      ['media:releaseVideo', token], ['media:releaseVideo', token],
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Video preparation canceled');
    expect(container.querySelector('video')).toBeNull();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Local audio previews', () => {
  it('retains native controls after a file is decoded and releases the temporary source on close', async () => {
    invoke.mockImplementation(async channel => channel === 'media:prepareAudio'
      ? { success: true, path: prepared }
      : { success: true });
    const view = render(<LocalAudioPreview url="http://asset.localhost/original.aiff" path={source} title="Preview" />);
    fireEvent.error(screen.getByLabelText('Preview'));
    expect(screen.getByRole('status')).toHaveTextContent('Preparing audio');
    await waitFor(() => expect(screen.getByLabelText('Preview')).toHaveAttribute('src', 'http://asset.localhost/' + encodeURIComponent(prepared)));
    expect(screen.getByLabelText('Preview')).toHaveAttribute('controls');
    const token = invoke.mock.calls[0][1];
    expect(invoke).toHaveBeenCalledWith('media:prepareAudio', token, source);
    view.unmount();
    expect(invoke).toHaveBeenCalledWith('media:releaseAudio', token);
  });

  it('releases a late result even if the first release preceded native registration', async () => {
    let finish: (result: { success: boolean; path: string }) => void = () => {};
    invoke.mockImplementation(channel => channel === 'media:prepareAudio'
      ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve({ success: true }));
    const view = render(<LocalAudioPreview url="http://asset.localhost/original.aiff" path={source} title="Preview" />);
    fireEvent.error(screen.getByLabelText('Preview'));
    view.unmount();
    await act(async () => { finish({ success: true, path: prepared }); });
    const token = invoke.mock.calls[0][1];
    expect(invoke.mock.calls.filter(([channel]) => channel === 'media:releaseAudio')).toEqual([
      ['media:releaseAudio', token], ['media:releaseAudio', token],
    ]);
  });
});
