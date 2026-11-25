// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * The one scrubber for DEX audio and video: a thin track that thickens under
 * the pointer, the buffered part, the played part, a knob, and the time under
 * the pointer while hovering or dragging. Drag uses pointer capture (mouse,
 * touch and pen); the keyboard works like a slider (arrows 5 s, Page 10 %,
 * Home/End). Seeking happens while dragging, so the picture follows the finger.
 *
 * Also: PlayableMediaStatus, the small overlay shown while a file is prepared
 * for playback (see services/media/playableMedia.ts).
 */
import React, { useCallback, useRef, useState } from 'react';
import type { PlayableStatus } from '../../services/media/playableMedia';

export function formatMediaTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Time at a pointer x inside a track rect (pure, for tests). */
export function timeAt(clientX: number, left: number, width: number, duration: number): number {
  if (!(width > 0) || !(duration > 0)) return 0;
  return Math.min(duration, Math.max(0, ((clientX - left) / width) * duration));
}

export interface MediaScrubberProps {
  current: number;
  duration: number;
  /** Buffered end, in seconds (the furthest buffered point ahead of `current`). */
  buffered?: number;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** On a dark video overlay (light ink) or a normal surface (theme ink). */
  tone?: 'overlay' | 'surface';
  label?: string;
}

export const MediaScrubber: React.FC<MediaScrubberProps> = ({ current, duration, buffered = 0, onSeek, onScrubStart, onScrubEnd, tone = 'surface', label = 'Seek' }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hot, setHot] = useState(false);
  const shown = drag ?? current;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;
  const bufPct = duration > 0 ? Math.min(100, (Math.max(buffered, shown) / duration) * 100) : 0;
  const ink = tone === 'overlay' ? 'rgba(255,255,255,' : null;
  const rail = ink ? `${ink}0.28)` : 'var(--color-border)';
  const buf = ink ? `${ink}0.45)` : 'color-mix(in srgb, var(--color-text-tertiary) 55%, transparent)';

  const at = useCallback((x: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r ? timeAt(x, r.left, r.width, duration) : 0;
  }, [duration]);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !(duration > 0)) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const t = at(e.clientX);
    setDrag(t);
    onScrubStart?.();
    onSeek(t);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = at(e.clientX);
    setHoverT(t);
    if (drag != null) { setDrag(t); onSeek(t); }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag == null) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    onSeek(at(e.clientX));
    setDrag(null);
    onScrubEnd?.();
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(duration > 0)) return;
    const step = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: duration / 10, PageDown: -duration / 10 } as Record<string, number>;
    let t: number | null = null;
    if (e.key in step) t = current + step[e.key];
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = duration;
    if (t == null) return;
    e.preventDefault();
    e.stopPropagation();
    onSeek(Math.min(duration, Math.max(0, t)));
  };

  const thick = hot || drag != null ? 6 : 3;
  const previewT = drag ?? hoverT;
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(shown) || 0}
      aria-valuetext={`${formatMediaTime(shown)} of ${formatMediaTime(duration)}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => { setHot(false); setHoverT(null); }}
      onKeyDown={onKey}
      style={{ position: 'relative', height: 18, display: 'flex', alignItems: 'center', cursor: duration > 0 ? 'pointer' : 'default', touchAction: 'none', outline: 'none' }}
    >
      <div style={{ position: 'relative', width: '100%', height: thick, borderRadius: 9999, background: rail, transition: 'height 0.12s ease', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${bufPct}%`, background: buf }} />
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--color-accent)' }} />
      </div>
      <div aria-hidden="true" style={{
        position: 'absolute', left: `${pct}%`, top: '50%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%',
        background: ink ? '#fff' : 'var(--color-accent)', boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        opacity: hot || drag != null ? 1 : 0, transition: 'opacity 0.12s ease', pointerEvents: 'none',
      }} />
      {previewT != null && duration > 0 && (hot || drag != null) && (
        <div aria-hidden="true" style={{
          position: 'absolute', bottom: 18, left: `${(previewT / duration) * 100}%`, transform: 'translateX(-50%)',
          padding: '2px 7px', borderRadius: 9999, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          background: ink ? 'rgba(0,0,0,0.78)' : 'var(--color-bg-elevated)', color: ink ? '#fff' : 'var(--color-text-primary)',
          boxShadow: ink ? 'none' : 'inset 0 0 0 1px var(--color-border-subtle)', pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>{formatMediaTime(previewT)}</div>
      )}
    </div>
  );
};

/** Overlay while a file is being prepared, or why it cannot play. Renders nothing when playing directly. */
export const PlayableMediaStatus: React.FC<{ status: PlayableStatus; percent: number; error: string | null }> = ({ status, percent, error }) => {
  if (status !== 'preparing' && status !== 'error') return null;
  return (
    <div role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 14, maxWidth: 360, textAlign: 'center',
        background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 12.5, lineHeight: 1.45,
      }}>
        {status === 'preparing' ? (
          <>
            <span style={{ fontWeight: 600 }}>Preparing this file for playback{percent > 0 ? ` · ${Math.round(percent)}%` : '…'}</span>
            <div style={{ width: 180, height: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(4, percent)}%`, height: '100%', background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ opacity: 0.7, fontSize: 11 }}>Done once; it plays instantly next time.</span>
          </>
        ) : (
          <span>{error || 'This file cannot be played.'}</span>
        )}
      </div>
    </div>
  );
};

export default MediaScrubber;
