// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { startNativeVideoPreview } from '../services/media/localMedia';
import { isTauri } from '../services/platform/tauriCompat';

type Preview = { status: 'preparing' } | { status: 'ready'; source: string } | { status: 'error'; message: string };

export function useVideoPreview(url?: string, path?: string) {
  const [preview, setPreview] = useState<Preview>();
  const active = useRef<{ request: ReturnType<typeof startNativeVideoPreview>; release: () => void } | undefined>(undefined);

  const release = useCallback(() => {
    active.current?.release();
    active.current = undefined;
  }, []);

  useLayoutEffect(() => {
    setPreview(undefined);
    return release;
  }, [url, path, release]);

  const onError = () => {
    if (preview?.status === 'preparing') return;
    if (path && isTauri() && !preview && !active.current) {
      const request = startNativeVideoPreview(path);
      active.current = { request, release: request.retain() };
      setPreview({ status: 'preparing' });
      void request.url.then(source => {
        if (active.current?.request === request) setPreview({ status: 'ready', source });
      }).catch(error => {
        if (active.current?.request !== request) return;
        release();
        setPreview({ status: 'error', message: error instanceof Error ? error.message : 'Could not prepare this video.' });
      });
      return;
    }
    release();
    setPreview({ status: 'error', message: 'Could not play this video.' });
  };

  return {
    source: preview?.status === 'ready' ? preview.source : url,
    preparing: preview?.status === 'preparing',
    error: preview?.status === 'error' ? preview.message : undefined,
    onError,
    cancel() {
      release();
      setPreview({ status: 'error', message: 'Video preparation canceled.' });
    },
    retain() {
      return active.current?.request.retain();
    },
  };
}

export function VideoPreviewStatus({ preparing, error, onCancel }: {
  preparing: boolean;
  error?: string;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
      <span role="status">{preparing ? 'Preparing video for playback…' : error}</span>
      {preparing && <button type="button" onClick={onCancel}>Cancel</button>}
    </div>
  );
}

export function QuickLookVideo({ url, path, onOpen, openError }: {
  url: string;
  path?: string;
  onOpen: () => void;
  openError?: string;
}) {
  const preview = useVideoPreview(url, path);
  if (preview.preparing || preview.error) {
    return (
      <div style={{ display: 'grid', justifyItems: 'center', paddingBottom: 16 }}>
        <VideoPreviewStatus preparing={preview.preparing} error={preview.error} onCancel={preview.cancel} />
        {preview.error && path && <button type="button" onClick={onOpen}>Open file</button>}
        {openError && <span role="alert">{openError}</span>}
      </div>
    );
  }
  return (
    <video
      key={preview.source}
      src={preview.source}
      controls
      playsInline
      preload="metadata"
      onError={preview.onError}
      style={{ width: '100%', maxHeight: '60vh', borderRadius: 6, background: '#000' }}
    />
  );
}
