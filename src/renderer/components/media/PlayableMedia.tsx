// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * <video> and <audio> that play any local file: formats WebView2 cannot
 * decode are prepared natively first (services/media/playableMedia.ts), with a
 * progress overlay. Drop-in replacements for previews (Quick Look, Files).
 */
import React from 'react';
import { usePlayableMedia } from '../../services/media/playableMedia';
import { PlayableMediaStatus } from './MediaScrubber';

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'src'> & { src: string; wrapperStyle?: React.CSSProperties };
type AudioProps = Omit<React.AudioHTMLAttributes<HTMLAudioElement>, 'src'> & { src: string; wrapperStyle?: React.CSSProperties };

export const PlayableVideo: React.FC<VideoProps> = ({ src, wrapperStyle, onError, ...rest }) => {
  const p = usePlayableMedia(src);
  return (
    <div style={{ position: 'relative', minHeight: p.status === 'preparing' || p.status === 'error' ? 160 : undefined, ...wrapperStyle }}>
      {p.src && <video src={p.src} onError={(e) => { p.onMediaError(); onError?.(e); }} {...rest} />}
      <PlayableMediaStatus status={p.status} percent={p.percent} error={p.error} />
    </div>
  );
};

export const PlayableAudio: React.FC<AudioProps> = ({ src, wrapperStyle, onError, ...rest }) => {
  const p = usePlayableMedia(src);
  return (
    <div style={{ position: 'relative', minHeight: p.status === 'preparing' || p.status === 'error' ? 96 : undefined, ...wrapperStyle }}>
      {p.src && <audio src={p.src} onError={(e) => { p.onMediaError(); onError?.(e); }} {...rest} />}
      <PlayableMediaStatus status={p.status} percent={p.percent} error={p.error} />
    </div>
  );
};
