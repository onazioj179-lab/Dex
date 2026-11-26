// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useEffect, useRef, useState } from 'react';
import { startNativeAudioPreview } from '../services/media/localMedia';
import { isTauri } from '../services/platform/tauriCompat';

export function LocalAudioPreview({ url, path, title }: { url: string; path?: string; title: string }) {
  const preview = useRef<ReturnType<typeof startNativeAudioPreview> | null>(null);
  const [source, setSource] = useState(url);
  const [state, setState] = useState<'ready' | 'preparing' | 'failed'>('ready');
  const [error, setError] = useState('');

  useEffect(() => () => {
    const job = preview.current;
    preview.current = null;
    job?.release();
  }, []);

  const onError = () => {
    if (!path || !isTauri() || preview.current) {
      setError('DEX could not play this audio file.');
      setState('failed');
      return;
    }
    const job = startNativeAudioPreview(path);
    preview.current = job;
    setState('preparing');
    void job.url.then(result => {
      if (preview.current !== job) return;
      setSource(result);
      setState('ready');
    }).catch(reason => {
      if (preview.current !== job) return;
      setError(reason instanceof Error ? reason.message : 'DEX could not decode this audio file.');
      setState('failed');
    });
  };

  if (state === 'preparing') return <span role="status">Preparing audio for playback…</span>;
  if (state === 'failed') return <span role="status">{error}</span>;
  return <audio key={source} aria-label={title} src={source} controls preload="metadata"
    style={{ width: '100%', maxWidth: 480 }} onError={onError} />;
}
