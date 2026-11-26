// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { formatClock } from '../../shared/format/units';
import './mediaScrubber.css';

interface Props {
  position: number;
  duration: number;
  label: string;
  onSeek: (seconds: number) => void;
  buffered?: number;
  loop?: { start: number; end: number };
}

export function MediaScrubber({ position, duration, label, onSeek, buffered = 0, loop }: Props) {
  const ready = Number.isFinite(duration) && duration > 0;
  const clamp = (seconds: number) => ready && Number.isFinite(seconds) ? Math.max(0, Math.min(duration, seconds)) : 0;
  const at = clamp(position);
  const percent = (seconds: number) => `${ready ? clamp(seconds) / duration * 100 : 0}%`;
  const styles = {
    '--media-position': percent(at),
    '--media-buffered': percent(buffered),
    '--media-loop-start': percent(loop?.start ?? 0),
    '--media-loop-end': percent(loop?.end ?? 0),
  } as React.CSSProperties;
  return (
    <div className="dex-media-scrubber" style={styles}>
      <div className="dex-media-scrubber-track" aria-hidden="true">{loop && <span />}</div>
      <input type="range" min={0} max={ready ? duration : 1} step="any" value={at}
        disabled={!ready} aria-label={label} aria-valuetext={`${formatClock(at)} of ${formatClock(ready ? duration : 0)}`}
        onKeyDown={event => {
          const delta = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[event.key];
          if (delta === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          onSeek(clamp(at + delta));
        }}
        onChange={event => onSeek(event.currentTarget.valueAsNumber)} />
    </div>
  );
}

export function bufferedThrough(media: HTMLMediaElement): number {
  for (let i = 0; i < media.buffered.length; i++) {
    if (media.buffered.start(i) <= media.currentTime && media.currentTime <= media.buffered.end(i)) return media.buffered.end(i);
  }
  return 0;
}
