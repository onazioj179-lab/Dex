// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Timeline
 * Multi-track timeline with clip visuals, ruler, playhead, track headers,
 * razor tool, trim handles, drag, ripple delete, snap.
 * All positions are integer frame numbers.
 */

import React, { useCallback, useRef, useState, useEffect, memo, useMemo } from 'react';
import { useVinxStore } from './VinxStore';
import type { Track, Clip, VinxTool, Marker } from './VinxTypes';
import { getAdaptiveDPR } from '../../utils/adaptiveCanvas';
import {
  generateId, formatTimecode, VINX_COLORS, TRACK_HEADER_WIDTH, DEFAULT_TRACK_HEIGHTS,
} from './VinxTypes';
import {
  createMoveClipCommand, createTrimClipCommand, createSplitClipCommand,
  createRemoveClipCommand, createRippleDeleteCommand,
} from './VinxCommands';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const RULER_HEIGHT = 24;
const PIXELS_PER_FRAME_BASE = 4;
const TRIM_HANDLE_WIDTH = 6;
const SNAP_THRESHOLD = 8;

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function frameToPixels(frame: number, zoom: number): number {
  return frame * PIXELS_PER_FRAME_BASE * zoom;
}

function pixelsToFrame(px: number, zoom: number): number {
  return Math.round(px / (PIXELS_PER_FRAME_BASE * zoom));
}

function getClipColor(trackType: Track['type']): string {
  if (trackType === 'video') return VINX_COLORS.videoTrack;
  if (trackType === 'audio') return VINX_COLORS.audioTrack;
  return VINX_COLORS.titleTrack;
}

/**
 * Translucent variant of a clip color. getClipColor can return a CSS var()
 * token (videoTrack === 'var(--color-accent)'); appending hex-alpha digits to a
 * var() produces invalid CSS, so video clips would lose all tint/border. color-mix
 * (premultiplied) keeps the hue and works for both hex and token inputs.
 */
function alpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** Collect all snap-worthy frame positions in the sequence */
function collectSnapPoints(tracks: Track[], currentFrame: number, markers: Marker[], excludeClipId?: string): number[] {
  const pts: number[] = [0, currentFrame];
  for (const m of markers) pts.push(m.frame);
  for (const t of tracks) {
    for (const c of t.clips) {
      if (c.id === excludeClipId) continue;
      pts.push(c.startFrame, c.endFrame);
    }
  }
  return pts;
}

/** Return snapped frame if within threshold, otherwise the original */
function snapFrame(frame: number, snapPoints: number[], thresholdFrames: number): number {
  let best = frame;
  let bestDist = Infinity;
  for (const pt of snapPoints) {
    const d = Math.abs(frame - pt);
    if (d < bestDist && d <= thresholdFrames) {
      bestDist = d;
      best = pt;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// RULER
// ---------------------------------------------------------------------------

const TimelineRuler: React.FC<{
  zoom: number; scrollX: number; width: number; frameRate: number;
  currentFrame: number; onSeek: (frame: number) => void;
  duration: number;
}> = memo(({ zoom, scrollX, width, frameRate, currentFrame, onSeek, duration }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = getAdaptiveDPR();
    canvas.width = width * dpr;
    canvas.height = RULER_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, RULER_HEIGHT);
    ctx.fillStyle = 'var(--color-bg-base)';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    const ppf = PIXELS_PER_FRAME_BASE * zoom;
    const startFrame = Math.floor(scrollX / ppf);
    const endFrame = Math.ceil((scrollX + width) / ppf);

    // Determine tick interval based on zoom
    let majorInterval = frameRate;
    if (zoom > 4) majorInterval = Math.max(1, Math.round(frameRate / 4));
    else if (zoom > 2) majorInterval = Math.round(frameRate / 2);
    else if (zoom < 0.2) majorInterval = frameRate * 10;
    else if (zoom < 0.5) majorInterval = frameRate * 5;
    const minorInterval = Math.max(1, Math.round(majorInterval / 5));

    for (let f = Math.floor(startFrame / minorInterval) * minorInterval; f <= endFrame; f += minorInterval) {
      const x = f * ppf - scrollX;
      const isMajor = f % majorInterval === 0;

      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT);
      ctx.lineTo(x, isMajor ? 4 : RULER_HEIGHT - 6);
      ctx.strokeStyle = isMajor ? 'var(--color-text-tertiary)' : 'var(--color-bg-hover)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = 'var(--color-text-tertiary)';
        ctx.font = '9px "SF Mono", "Cascadia Code", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatTimecode(f, frameRate), x, 12);
      }
    }

    // Playhead marker on ruler
    const playheadX = currentFrame * ppf - scrollX;
    ctx.fillStyle = VINX_COLORS.playhead;
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, 0);
    ctx.lineTo(playheadX + 5, 0);
    ctx.lineTo(playheadX + 5, 6);
    ctx.lineTo(playheadX, RULER_HEIGHT - 2);
    ctx.lineTo(playheadX - 5, 6);
    ctx.closePath();
    ctx.fill();

    // Bottom border
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(width, RULER_HEIGHT - 0.5);
    ctx.strokeStyle = 'var(--color-bg-hover)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [zoom, scrollX, width, frameRate, currentFrame, duration]);

  const handlePointer = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + scrollX;
    const frame = Math.max(0, pixelsToFrame(x, zoom));
    onSeek(frame);
  }, [scrollX, zoom, onSeek]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height: RULER_HEIGHT, cursor: 'pointer', flexShrink: 0, display: 'block', touchAction: 'none' }}
      onPointerDown={e => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handlePointer(e);
      }}
      onPointerMove={e => { if (dragging.current) handlePointer(e); }}
      onPointerUp={() => { dragging.current = false; }}
    />
  );
});

TimelineRuler.displayName = 'TimelineRuler';

// ---------------------------------------------------------------------------
// TRACK HEADER
// ---------------------------------------------------------------------------

const TrackHeader: React.FC<{
  track: Track;
  focused: boolean;
  onFocusTrack: (trackId: string) => void;
  onNavigateTrack: (trackId: string, dir: 'up' | 'down') => void;
}> = memo(({ track, focused, onFocusTrack, onNavigateTrack }) => {
  const toggleMute = useVinxStore(s => s.toggleTrackMute);
  const toggleLock = useVinxStore(s => s.toggleTrackLock);
  const toggleVisible = useVinxStore(s => s.toggleTrackVisible);
  const toggleSolo = useVinxStore(s => s.toggleTrackSolo);

  const color = getClipColor(track.type);

  return (
    <div style={{
      width: TRACK_HEADER_WIDTH, height: track.height, flexShrink: 0,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 6px', borderBottom: '1px solid var(--color-border-subtle)',
      borderRight: '1px solid var(--color-bg-hover)',
      background: focused ? 'var(--color-accent-soft, rgba(74,158,255,0.12))' : 'var(--color-bg-base)',
      outline: focused ? '1px solid var(--color-accent-muted, rgba(74,158,255,0.45))' : 'none',
      outlineOffset: -1,
    }}
      tabIndex={0}
      role="button"
      data-vinx-track-header-id={track.id}
      aria-label={`Track ${track.name}`}
      aria-current={focused ? 'true' : undefined}
      onFocus={() => onFocusTrack(track.id)}
      onClick={() => onFocusTrack(track.id)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          onNavigateTrack(track.id, 'up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onNavigateTrack(track.id, 'down');
        }
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.name}</span>
      </div>
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}>
        <HeaderBtn label="M" active={track.muted} onClick={() => toggleMute(track.id)} activeColor="#FF6B6B" />
        <HeaderBtn label="S" active={track.solo} onClick={() => toggleSolo(track.id)} activeColor="#FFD93D" />
        {track.type === 'video' && (
          <HeaderBtn label="V" active={track.visible} onClick={() => toggleVisible(track.id)} activeColor="#4A9EFF" />
        )}
        <HeaderBtn label="L" active={track.locked} onClick={() => toggleLock(track.id)} activeColor="#D4853A" />
      </div>
    </div>
  );
});

TrackHeader.displayName = 'TrackHeader';

const HeaderBtn: React.FC<{ label: string; active: boolean; onClick: () => void; activeColor: string }> = memo(({ label, active, onClick, activeColor }) => (
  <button
    aria-label={`Toggle ${label}`}
    aria-pressed={active}
    style={{
      width: 18, height: 14, fontSize: 8, fontWeight: 600,
      border: '1px solid var(--color-border)', borderRadius: 2,
      background: active ? `${activeColor}20` : 'transparent',
      color: active ? activeColor : 'var(--color-text-tertiary)',
      cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={onClick}
  >
    {label}
  </button>
));

HeaderBtn.displayName = 'HeaderBtn';

// ---------------------------------------------------------------------------
// CLIP VISUAL
// ---------------------------------------------------------------------------

const ClipVisual: React.FC<{
  clip: Clip; track: Track; zoom: number; scrollX: number; viewportWidth: number;
  selected: boolean; activeTool: VinxTool;
  onSelect: (clipId: string, multi: boolean) => void;
  onDragStart: (clipId: string, trackId: string, startFrame: number) => void;
  onTrimStart: (clipId: string, side: 'left' | 'right') => void;
  onSplit: (clipId: string, frame: number) => void;
  onClipContextMenu?: (clipId: string, trackId: string, x: number, y: number) => void;
}> = memo(({ clip, track, zoom, scrollX, viewportWidth, selected, activeTool, onSelect, onDragStart, onTrimStart, onSplit, onClipContextMenu }) => {
  const color = getClipColor(track.type);
  const x = frameToPixels(clip.startFrame, zoom) - scrollX;
  const width = frameToPixels(clip.endFrame - clip.startFrame, zoom);

  // NOTE: hooks must run unconditionally. The off-screen cull below must come
  // AFTER this useCallback, otherwise scrolling a clip on/off screen changes the
  // hook count between renders and React throws "rendered fewer hooks than expected".
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool === 'razor') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const splitFrame = clip.startFrame + pixelsToFrame(localX, zoom);
      onSplit(clip.id, splitFrame);
      return;
    }
    onSelect(clip.id, e.ctrlKey || e.metaKey);
    if (activeTool === 'select') {
      onDragStart(clip.id, clip.trackId, clip.startFrame);
    }
  }, [activeTool, clip.id, clip.trackId, clip.startFrame, zoom, onSelect, onDragStart, onSplit]);

  // Off-screen culling against the real visible lane width (was a hardcoded 5000px,
  // which over-rendered on narrow panels and under-culled on ultrawide ones).
  if (x + width < 0 || x > viewportWidth) return null;

  const clipStyle: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: 2,
    width: Math.max(width, 2),
    height: track.height - 4,
    background: selected ? alpha(color, 19) : alpha(color, 9),
    border: `1px solid ${selected ? color : alpha(color, 25)}`,
    borderRadius: 2,
    overflow: 'hidden',
    cursor: activeTool === 'razor' ? 'crosshair' : activeTool === 'select' ? 'grab' : 'default',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={clipStyle} onPointerDown={handlePointerDown} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onClipContextMenu?.(clip.id, track.id, e.clientX, e.clientY); }}>
      {/* Trim handles */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: TRIM_HANDLE_WIDTH,
          cursor: 'ew-resize', background: selected ? alpha(color, 25) : 'transparent',
          zIndex: 1,
        }}
        onPointerDown={e => { e.stopPropagation(); onTrimStart(clip.id, 'left'); }}
      />
      <div
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: TRIM_HANDLE_WIDTH,
          cursor: 'ew-resize', background: selected ? alpha(color, 25) : 'transparent',
          zIndex: 1,
        }}
        onPointerDown={e => { e.stopPropagation(); onTrimStart(clip.id, 'right'); }}
      />

      {/* Clip name */}
      <div style={{
        fontSize: 10, color: 'var(--color-text-primary)', padding: '2px var(--space-2)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700, flexShrink: 0,
      }}>
        {clip.name}
      </div>

      {/* Video clip frame strips */}
      {track.type === 'video' && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'stretch', overflow: 'hidden',
          background: `linear-gradient(90deg, ${alpha(color, 8)} 0%, ${alpha(color, 3)} 50%, ${alpha(color, 8)} 100%)`,
        }}>
          {Array.from({ length: Math.max(1, Math.floor(width / 36)) }, (_, i) => {
            const seed = clip.id.charCodeAt(0) + i * 7;
            const brightness = 28 + (seed % 12);
            return (
              <div key={i} style={{
                flex: 1, borderRight: `1px solid ${alpha(color, 8)}`,
                background: `linear-gradient(180deg, hsl(${(seed * 37) % 360}, 15%, ${brightness}%) 0%, hsl(${(seed * 37 + 20) % 360}, 12%, ${brightness - 6}%) 100%)`,
              }} />
            );
          })}
        </div>
      )}

      {/* Audio waveform visualization */}
      {track.type === 'audio' && (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 1,
          padding: '2px 4px', overflow: 'hidden',
        }}>
          {Array.from({ length: Math.max(16, Math.min(64, Math.floor(width / 4))) }, (_, i) => {
            // Deterministic pseudo-random based on clip id + index for natural-looking waveform
            const s = clip.id.charCodeAt(0) + clip.id.charCodeAt(clip.id.length - 1);
            const phase1 = s * 0.13;
            const phase2 = s * 0.37;
            const h = Math.abs(Math.sin(i * 0.4 + phase1) * 55 + Math.cos(i * 0.9 + phase2) * 25 + Math.sin(i * 1.7 + s) * 15);
            return (
              <div key={i} style={{
                flex: 1, minWidth: 1.5, maxWidth: 4,
                height: `${Math.max(8, Math.min(90, h))}%`,
                background: `${color}70`,
                borderRadius: 2,
              }} />
            );
          })}
        </div>
      )}

      {/* Transition indicators */}
      {clip.transitionIn && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: frameToPixels(clip.transitionIn.durationFrames, zoom),
          background: `linear-gradient(90deg, ${alpha(color, 19)}, transparent)`,
          borderRight: `1px dashed ${alpha(color, 38)}`,
        }} />
      )}
      {clip.transitionOut && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: frameToPixels(clip.transitionOut.durationFrames, zoom),
          background: `linear-gradient(270deg, ${alpha(color, 19)}, transparent)`,
          borderLeft: `1px dashed ${alpha(color, 38)}`,
        }} />
      )}
    </div>
  );
});

ClipVisual.displayName = 'ClipVisual';

// ---------------------------------------------------------------------------
// TRACK LANE
// ---------------------------------------------------------------------------

const TrackLane: React.FC<{
  track: Track; zoom: number; scrollX: number; viewportWidth: number;
  selectedClipIds: string[]; activeTool: VinxTool;
  onSelect: (clipId: string, multi: boolean) => void;
  onDragStart: (clipId: string, trackId: string, startFrame: number) => void;
  onTrimStart: (clipId: string, side: 'left' | 'right') => void;
  onSplit: (clipId: string, frame: number) => void;
  onDropMedia: (trackId: string, frame: number, data: string) => void;
  onClipContextMenu?: (clipId: string, trackId: string, x: number, y: number) => void;
}> = memo(({ track, zoom, scrollX, viewportWidth, selectedClipIds, activeTool, onSelect, onDragStart, onTrimStart, onSplit, onDropMedia, onClipContextMenu }) => {

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mediaData = e.dataTransfer.getData('vinx/media');
    if (mediaData) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      const frame = Math.max(0, pixelsToFrame(x, zoom));
      onDropMedia(track.id, frame, mediaData);
    }
  }, [track.id, scrollX, zoom, onDropMedia]);

  return (
    <div
      style={{
        position: 'relative', height: track.height, flexShrink: 0,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: track.locked ? 'var(--color-border-subtle)' : 'transparent',
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {track.clips.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--color-text-muted)', fontSize: 11, opacity: 0.5, gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Drop media here
        </div>
      )}
      {track.clips.map(clip => (
        <ClipVisual
          key={clip.id}
          clip={clip}
          track={track}
          zoom={zoom}
          scrollX={scrollX}
          viewportWidth={viewportWidth}
          selected={selectedClipIds.includes(clip.id)}
          activeTool={activeTool}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onTrimStart={onTrimStart}
          onSplit={onSplit}
          onClipContextMenu={onClipContextMenu}
        />
      ))}
    </div>
  );
});

TrackLane.displayName = 'TrackLane';

// ---------------------------------------------------------------------------
// PLAYHEAD
// ---------------------------------------------------------------------------

const Playhead: React.FC<{ frame: number; zoom: number; scrollX: number; height: number; viewportWidth: number }> = memo(({ frame, zoom, scrollX, height, viewportWidth }) => {
  const x = frameToPixels(frame, zoom) - scrollX;
  // Cull against the real visible lane width rather than a hardcoded 5000px.
  if (x < 0 || x > viewportWidth) return null;

  return (
    <div style={{
      position: 'absolute', left: x + TRACK_HEADER_WIDTH, top: 0,
      width: 1, height, background: VINX_COLORS.playhead, zIndex: 10, pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', top: -1, left: -4, width: 9, height: 9,
        background: VINX_COLORS.playhead, clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
      }} />
    </div>
  );
});

Playhead.displayName = 'Playhead';

// ---------------------------------------------------------------------------
// MARKER VISUAL
// ---------------------------------------------------------------------------

const MarkerVisual: React.FC<{ marker: Marker; zoom: number; scrollX: number; height: number }> = memo(({ marker, zoom, scrollX, height }) => {
  const x = frameToPixels(marker.frame, zoom) - scrollX + TRACK_HEADER_WIDTH;

  return (
    <div style={{
      position: 'absolute', left: x, top: 0, height,
      width: 1, background: `${marker.color}60`, zIndex: 5, pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', top: -1, left: -3, width: 7, height: 7,
        background: marker.color, borderRadius: 2,
      }} />
    </div>
  );
});

MarkerVisual.displayName = 'MarkerVisual';

// ---------------------------------------------------------------------------
// TIMELINE TOOLBAR
// ---------------------------------------------------------------------------

const TimelineToolbar: React.FC = memo(() => {
  const activeTool = useVinxStore(s => s.activeTool);
  const setTool = useVinxStore(s => s.setTool);
  const snapEnabled = useVinxStore(s => s.snapEnabled);
  const toggleSnap = useVinxStore(s => s.toggleSnap);
  const zoom = useVinxStore(s => s.timelineZoom);
  const setZoom = useVinxStore(s => s.setTimelineZoom);
  const addTrack = useVinxStore(s => s.addTrack);

  const tools: Array<{ tool: VinxTool; label: string }> = [
    { tool: 'select', label: 'V' },
    { tool: 'razor', label: 'C' },
    { tool: 'slip', label: 'Y' },
    { tool: 'slide', label: 'U' },
    { tool: 'hand', label: 'H' },
  ];

  return (
    <div
      data-testid="timeline-tools"
      style={{
      height: 28, display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px',
      borderBottom: '1px solid var(--color-bg-hover)', flexShrink: 0, background: 'var(--color-bg-base)',
      minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
      }}
    >
      {tools.map(t => (
        <button
          key={t.tool}
          aria-label={`${t.tool} tool`}
          aria-pressed={activeTool === t.tool}
          style={{
            width: 22, height: 20, fontSize: 10, fontWeight: 600,
            border: '1px solid var(--color-border-subtle)', borderRadius: 2,
            background: activeTool === t.tool ? 'var(--color-accent-soft, rgba(74,158,255,0.15))' : 'transparent',
            color: activeTool === t.tool ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            cursor: 'pointer', padding: 0,
          }}
          onClick={() => setTool(t.tool)}
          title={`${t.tool} (${t.label})`}
        >
          {t.label}
        </button>
      ))}

      <div style={{ width: 1, height: 14, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

      <button
        aria-label="Toggle snapping"
        aria-pressed={snapEnabled}
        style={{
          height: 20, fontSize: 9, fontWeight: 600, padding: '0 6px',
          border: '1px solid var(--color-border-subtle)', borderRadius: 2,
          background: snapEnabled ? 'var(--color-accent-soft, rgba(74,158,255,0.15))' : 'transparent',
          color: snapEnabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer',
        }}
        onClick={toggleSnap}
      >
        Snap
      </button>

      <div style={{ flex: '1 1 8px', minWidth: 8 }} />

      {/* Track add buttons */}
      <button aria-label="Add video track" onClick={() => addTrack('video')} style={addTrackBtnStyle} title="Add video track">+V</button>
      <button aria-label="Add audio track" onClick={() => addTrack('audio')} style={addTrackBtnStyle} title="Add audio track">+A</button>
      <button aria-label="Add title track" onClick={() => addTrack('title')} style={addTrackBtnStyle} title="Add title track">+T</button>

      <div style={{ width: 1, height: 14, background: 'var(--color-bg-hover)', margin: '0 4px' }} />

      {/* Zoom controls */}
      <button aria-label="Zoom out timeline" style={zoomBtnStyle} onClick={() => setZoom(zoom / 1.5)}>-</button>
      <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', width: 32, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button aria-label="Zoom in timeline" style={zoomBtnStyle} onClick={() => setZoom(zoom * 1.5)}>+</button>
    </div>
  );
});

TimelineToolbar.displayName = 'TimelineToolbar';

const addTrackBtnStyle: React.CSSProperties = {
  height: 20, fontSize: 9, fontWeight: 600, padding: '0 4px',
  border: '1px solid var(--color-border-subtle)', borderRadius: 2,
  background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0,
};

const zoomBtnStyle: React.CSSProperties = {
  width: 20, height: 20, fontSize: 12,
  border: '1px solid var(--color-border-subtle)', borderRadius: 2,
  background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};

// ---------------------------------------------------------------------------
// TIMELINE (MAIN EXPORT)
// ---------------------------------------------------------------------------

export const Timeline: React.FC<{
  onSeek: (frame: number) => void;
  onClipContextMenu?: (clipId: string, trackId: string, x: number, y: number) => void;
}> = memo(({ onSeek, onClipContextMenu }) => {
  const zoom = useVinxStore(s => s.timelineZoom);
  const scrollX = useVinxStore(s => s.timelineScrollX);
  const scrollY = useVinxStore(s => s.timelineScrollY);
  const setScrollX = useVinxStore(s => s.setTimelineScrollX);
  const setScrollY = useVinxStore(s => s.setTimelineScrollY);
  const currentFrame = useVinxStore(s => s.currentFrame);
  const frameRate = useVinxStore(s => s.project.frameRate);
  const selectedClipIds = useVinxStore(s => s.selectedClipIds);
  const activeTool = useVinxStore(s => s.activeTool);
  const selectClip = useVinxStore(s => s.selectClip);
  const deselectAll = useVinxStore(s => s.deselectAll);
  const executeCommand = useVinxStore(s => s.executeCommand);
  const getClipById = useVinxStore(s => s.getClipById);
  const getActiveSequence = useVinxStore(s => s.getActiveSequence);
  const getSequenceDuration = useVinxStore(s => s.getSequenceDuration);
  const markers = useVinxStore(s => s.project.markers);
  const snapEnabled = useVinxStore(s => s.snapEnabled);

  const sequence = getActiveSequence();
  const tracks = sequence.tracks;
  const duration = getSequenceDuration();
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(tracks[0]?.id ?? null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusedTrackId && tracks[0]?.id) {
      setFocusedTrackId(tracks[0].id);
      return;
    }
    if (focusedTrackId && !tracks.some((t) => t.id === focusedTrackId)) {
      setFocusedTrackId(tracks[0]?.id ?? null);
    }
  }, [focusedTrackId, tracks]);

  const laneWidth = containerWidth - TRACK_HEADER_WIDTH;
  const totalHeight = tracks.reduce((sum, t) => sum + t.height, 0);

  // -- Clip drag state --
  const dragRef = useRef<{
    clipId: string; trackId: string; startFrame: number; offsetFrame: number;
  } | null>(null);

  // -- Trim state --
  const trimRef = useRef<{
    clipId: string; side: 'left' | 'right';
    initialStart: number; initialEnd: number; initialMediaIn: number; initialMediaOut: number;
    initialX: number;
  } | null>(null);

  const handleDragStart = useCallback((clipId: string, trackId: string, startFrame: number) => {
    const clip = getClipById(clipId);
    if (!clip) return;
    const clipDuration = clip.endFrame - clip.startFrame;
    dragRef.current = { clipId, trackId, startFrame, offsetFrame: 0 };
    let accumDeltaPx = 0;

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      accumDeltaPx += e.movementX;
      const deltaFrames = pixelsToFrame(accumDeltaPx, zoom);
      if (deltaFrames === 0) return;

      let candidateStart = startFrame + deltaFrames;
      candidateStart = Math.max(0, candidateStart);

      if (snapEnabled) {
        const seq = getActiveSequence();
        const snapPts = collectSnapPoints(seq.tracks, currentFrame, markers, clipId);
        const snappedStart = snapFrame(candidateStart, snapPts, pixelsToFrame(SNAP_THRESHOLD, zoom));
        const snappedEnd = snapFrame(candidateStart + clipDuration, snapPts, pixelsToFrame(SNAP_THRESHOLD, zoom));
        // Pick whichever edge snapped closer
        const dStart = Math.abs(snappedStart - candidateStart);
        const dEnd = Math.abs(snappedEnd - (candidateStart + clipDuration));
        if (dEnd < dStart && dEnd <= pixelsToFrame(SNAP_THRESHOLD, zoom)) {
          candidateStart = snappedEnd - clipDuration;
        } else if (dStart <= pixelsToFrame(SNAP_THRESHOLD, zoom)) {
          candidateStart = snappedStart;
        }
      }

      if (candidateStart !== dragRef.current.startFrame + dragRef.current.offsetFrame) {
        dragRef.current.offsetFrame = candidateStart - startFrame;
        // Live preview: move clip via direct mutation for responsiveness
        useVinxStore.getState()._moveClip(clipId, trackId, candidateStart);
      }
    };

    const onUp = () => {
      if (dragRef.current && dragRef.current.offsetFrame !== 0) {
        // Undo the live preview, then apply via command for proper undo support
        useVinxStore.getState()._moveClip(clipId, trackId, startFrame);
        const finalStart = startFrame + dragRef.current.offsetFrame;
        const cmd = createMoveClipCommand(useVinxStore.getState, clipId, trackId, startFrame, trackId, finalStart);
        executeCommand(cmd);
      }
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [getClipById, zoom, snapEnabled, getActiveSequence, currentFrame, markers, executeCommand]);

  const handleTrimStart = useCallback((clipId: string, side: 'left' | 'right') => {
    const clip = getClipById(clipId);
    if (!clip) return;
    trimRef.current = {
      clipId, side,
      initialStart: clip.startFrame, initialEnd: clip.endFrame,
      initialMediaIn: clip.mediaInFrame, initialMediaOut: clip.mediaOutFrame,
      initialX: 0,
    };

    const storeGetState = useVinxStore.getState;

    const onMove = (e: PointerEvent) => {
      if (!trimRef.current) return;
      const delta = pixelsToFrame(e.movementX, zoom);
      if (delta === 0) return;

      const c = getClipById(clipId);
      if (!c) return;

      if (side === 'left') {
        const newStart = Math.max(0, c.startFrame + delta);
        const newMediaIn = c.mediaInFrame + (newStart - c.startFrame);
        if (newStart < c.endFrame && newMediaIn >= 0) {
          const cmd = createTrimClipCommand(
            storeGetState, clipId,
            c.startFrame, c.endFrame, c.mediaInFrame, c.mediaOutFrame,
            newStart, c.endFrame, newMediaIn, c.mediaOutFrame,
          );
          executeCommand(cmd);
        }
      } else {
        const newEnd = Math.max(c.startFrame + 1, c.endFrame + delta);
        const newMediaOut = c.mediaOutFrame + (newEnd - c.endFrame);
        if (newMediaOut >= 0) {
          const cmd = createTrimClipCommand(
            storeGetState, clipId,
            c.startFrame, c.endFrame, c.mediaInFrame, c.mediaOutFrame,
            c.startFrame, newEnd, c.mediaInFrame, newMediaOut,
          );
          executeCommand(cmd);
        }
      }
    };

    const onUp = () => {
      trimRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [getClipById, zoom, executeCommand]);

  const handleSplit = useCallback((clipId: string, frame: number) => {
    const clip = getClipById(clipId);
    if (!clip) return;
    if (frame <= clip.startFrame || frame >= clip.endFrame) return;

    const relSplit = frame - clip.startFrame;
    const leftClip: Clip = {
      ...clip,
      id: generateId('clip'),
      endFrame: frame,
      mediaOutFrame: clip.mediaInFrame + relSplit,
    };
    const rightClip: Clip = {
      ...clip,
      id: generateId('clip'),
      startFrame: frame,
      mediaInFrame: clip.mediaInFrame + relSplit,
    };

    const cmd = createSplitClipCommand(useVinxStore.getState, clip, leftClip, rightClip);
    executeCommand(cmd);
  }, [getClipById, executeCommand]);

  const handleDropMedia = useCallback((trackId: string, frame: number, data: string) => {
    // Handle drops from media browser
  }, []);

  // -- Scroll --
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const newZoom = zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      useVinxStore.getState().setTimelineZoom(newZoom);
    } else if (e.shiftKey) {
      setScrollX(scrollX + e.deltaY);
    } else {
      setScrollY(scrollY + e.deltaY);
    }
  }, [zoom, scrollX, scrollY, setScrollX, setScrollY]);

  // -- Click on empty area = deselect --
  const handleBackgroundClick = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  const handleTrackKeyboardNavigate = useCallback((trackId: string, dir: 'up' | 'down') => {
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const nextIdx = dir === 'up'
      ? Math.max(0, idx - 1)
      : Math.min(tracks.length - 1, idx + 1);
    const nextTrack = tracks[nextIdx];
    if (!nextTrack) return;
    setFocusedTrackId(nextTrack.id);
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-vinx-track-header-id="${nextTrack.id}"]`);
    el?.focus();
  }, [tracks]);

  // -- Keyboard shortcuts --
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore shortcuts while typing in a field, otherwise Delete/Backspace and the
      // single-letter tool keys (v/c/y/u/h/n) fire while editing text (e.g. the project
      // name input or any clip text field), silently deleting clips or switching tools.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const clips = useVinxStore.getState().getSelectedClips();
        for (const clip of clips) {
          const cmd = createRemoveClipCommand(useVinxStore.getState, clip);
          executeCommand(cmd);
        }
      }
      if (e.key === 'v') useVinxStore.getState().setTool('select');
      if (e.key === 'c') useVinxStore.getState().setTool('razor');
      if (e.key === 'y') useVinxStore.getState().setTool('slip');
      if (e.key === 'u') useVinxStore.getState().setTool('slide');
      if (e.key === 'h') useVinxStore.getState().setTool('hand');
      if (e.key === 'n') useVinxStore.getState().toggleSnap();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useVinxStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useVinxStore.getState().redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [executeCommand]);

  return (
    <div data-testid="vinx-timeline" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Timeline body */}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}
        onWheel={handleWheel}
      >
        {/* Ruler row */}
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <div style={{ width: TRACK_HEADER_WIDTH, height: RULER_HEIGHT, flexShrink: 0, background: 'var(--color-bg-base)', borderRight: '1px solid var(--color-bg-hover)', borderBottom: '1px solid var(--color-bg-hover)' }} />
          <TimelineRuler
            zoom={zoom} scrollX={scrollX} width={laneWidth > 0 ? laneWidth : 1}
            frameRate={frameRate} currentFrame={currentFrame}
            onSeek={onSeek} duration={duration}
          />
        </div>

        {/* Tracks */}
        <div
          style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
          onClick={handleBackgroundClick}
        >
          <div style={{
            display: 'flex', flexDirection: 'column',
            transform: `translateY(${-scrollY}px)`,
          }}>
            {tracks.map(track => (
              <div key={track.id} style={{ display: 'flex' }}>
                <TrackHeader
                  track={track}
                  focused={focusedTrackId === track.id}
                  onFocusTrack={setFocusedTrackId}
                  onNavigateTrack={handleTrackKeyboardNavigate}
                />
                <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
                  <TrackLane
                    track={track} zoom={zoom} scrollX={scrollX} viewportWidth={laneWidth}
                    selectedClipIds={selectedClipIds} activeTool={activeTool}
                    onSelect={selectClip} onDragStart={handleDragStart}
                    onTrimStart={handleTrimStart} onSplit={handleSplit}
                    onDropMedia={handleDropMedia}
                    onClipContextMenu={onClipContextMenu}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Playhead overlay */}
          <Playhead frame={currentFrame} zoom={zoom} scrollX={scrollX} height={totalHeight} viewportWidth={laneWidth} />

          {/* Markers */}
          {markers.map(m => (
            <MarkerVisual key={m.id} marker={m} zoom={zoom} scrollX={scrollX} height={totalHeight} />
          ))}
        </div>
      </div>
    </div>
  );
});

Timeline.displayName = 'Timeline';
