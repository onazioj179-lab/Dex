// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Global floating MiniPlayer — a persistent music remote.
 * -----------------------------------------------------------------------------
 * Mounted once at the app root. Reads the now-playing store and drives the real
 * audio engine (the Audio app) through it, so the user keeps play/pause, skip,
 * and scrub from anywhere in DEX. Hidden while the Audio app itself is in front
 * (no redundant controls) and when there is nothing playing or it was dismissed.
 */

import React, { useCallback } from 'react';
import { useNowPlaying } from '../services/nowPlaying';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 8,
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--color-text-secondary)', flexShrink: 0,
  transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
};

export const MiniPlayer: React.FC = () => {
  const track = useNowPlaying(s => s.track);
  const isPlaying = useNowPlaying(s => s.isPlaying);
  const currentTime = useNowPlaying(s => s.currentTime);
  const duration = useNowPlaying(s => s.duration);
  const dismissed = useNowPlaying(s => s.dismissed);
  const toggle = useNowPlaying(s => s.toggle);
  const next = useNowPlaying(s => s.next);
  const prev = useNowPlaying(s => s.prev);
  const seekPct = useNowPlaying(s => s.seekPct);
  const dismiss = useNowPlaying(s => s.dismiss);

  const currentAppId = useRunningApps(s => s.currentAppId);
  const launchApp = useRunningApps(s => s.launchApp);

  const onSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    seekPct(pct);
  }, [seekPct]);

  const openAudio = useCallback(() => {
    const def = APP_DEFINITIONS['audio'];
    if (def) launchApp({ id: 'audio', name: def.name, icon: def.icon, color: def.color });
  }, [launchApp]);

  // Hidden when nothing is playing, dismissed, or the Audio app is already in front.
  if (!track || dismissed || currentAppId === 'audio') return null;

  const pct = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div
      role="region"
      aria-label="Mini player"
      style={{
        position: 'fixed', right: 16, bottom: 84, zIndex: 5050,
        width: 320, maxWidth: 'calc(100vw - 32px)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        padding: '10px var(--space-3)',
        background: '#0E0E11',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 0.5px 0 rgba(255,255,255,0.05)',
        animation: 'dex-notify-in 0.22s var(--ease-tahoe)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Artwork / fallback */}
        <button
          onClick={openAudio}
          aria-label="Open music"
          title="Open Music"
          style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
            border: '1px solid var(--color-border-subtle)', cursor: 'pointer', padding: 0,
            background: track.artwork
              ? `center/cover no-repeat url(${JSON.stringify(track.artwork)})`
              : 'var(--color-bg-inset)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {!track.artwork && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
          )}
        </button>

        {/* Title / artist */}
        <button
          onClick={openAudio}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent',
            border: 'none', cursor: 'pointer', padding: 0,
          }}
          title={`${track.title}${track.artist ? ' — ' + track.artist : ''}`}
        >
          <div style={{
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{track.title || 'Unknown track'}</div>
          {track.artist && (
            <div style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{track.artist}</div>
          )}
        </button>

        {/* Transport */}
        <button style={iconBtn} onClick={prev} aria-label="Previous track"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
        </button>
        <button
          style={{ ...iconBtn, width: 34, height: 34, background: 'var(--color-accent)', color: 'var(--color-accent-text)' }}
          onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button style={iconBtn} onClick={next} aria-label="Next track"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zm-2 6L6 6v12z" /></svg>
        </button>
        <button style={iconBtn} onClick={dismiss} aria-label="Close mini player"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)'; }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Seek bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', width: 30, textAlign: 'right' }}>{fmt(currentTime)}</span>
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          onClick={onSeek}
          style={{ flex: 1, height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-hover)', cursor: 'pointer', position: 'relative' }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--color-accent)', borderRadius: 'var(--radius-full)' }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', width: 30 }}>{fmt(duration)}</span>
      </div>
    </div>
  );
};

export default MiniPlayer;
