// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Viewer
 * Dual viewer (Source + Program) with frame-accurate playback controls,
 * scrubber, safe zone overlays, full screen toggle.
 */

import React, { useCallback, useRef, useState, useEffect, memo, useMemo } from 'react';
import { useVinxStore } from './VinxStore';
import { formatTimecode } from './VinxTypes';
import type { Clip, MediaItem } from './VinxTypes';

// ---------------------------------------------------------------------------
// VIDEO LAYER - renders <video> elements for active clips in the canvas
// ---------------------------------------------------------------------------

const frameToSec = (frame: number, fps: number) => frame / fps;

// Build CSS filter string from clip effects
function buildClipCSSFilter(effects: Clip['effects']): string {
  const parts: string[] = [];

  // Apply effects 
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const p = effect.parameters;
    switch (effect.definitionId) {
      case 'gaussian-blur':
        parts.push(`blur(${p.radius ?? 10}px)`);
        break;
      case 'directional-blur':
        parts.push(`blur(${Number(p.radius ?? 10) * 0.7}px)`);
        break;
      case 'brightness-contrast': {
        const b = Number(p.brightness ?? 0);
        const c = Number(p.contrast ?? 0);
        if (b !== 0) parts.push(`brightness(${1 + b / 100})`);
        if (c !== 0) parts.push(`contrast(${1 + c / 100})`);
        break;
      }
      case 'hue-saturation': {
        const h = Number(p.hue ?? 0);
        const s = Number(p.saturation ?? 0);
        const l = Number(p.lightness ?? 0);
        if (h !== 0) parts.push(`hue-rotate(${h}deg)`);
        if (s !== 0) parts.push(`saturate(${1 + s / 100})`);
        if (l !== 0) parts.push(`brightness(${1 + l / 100})`);
        break;
      }
      case 'sharpen':
        parts.push(`contrast(${1 + Number(p.amount ?? 50) / 200})`);
        break;
      case 'posterize':
        parts.push(`contrast(${1 + 0.3 / Math.max(1, Number(p.levels ?? 6))}) saturate(1.2)`);
        break;
      case 'noise-reduction':
        parts.push(`blur(${Number(p.spatial ?? 30) / 60}px)`);
        break;
      case 'color-balance': {
        const sr = Number(p.shadowRed ?? 0);
        const mg = Number(p.midGreen ?? 0);
        const hb = Number(p.highlightBlue ?? 0);
        if (sr !== 0) parts.push(`sepia(${Math.abs(sr) / 200})`);
        if (mg !== 0) parts.push(`saturate(${1 + mg / 100})`);
        if (hb !== 0) parts.push(`hue-rotate(${hb}deg)`);
        break;
      }
      case 'glow':
        parts.push(`brightness(${1 + Number(p.intensity ?? 100) / 400}) contrast(${1 + Number(p.threshold ?? 60) / 400})`);
        break;
      case 'vignette':
        // Vignette handled via box-shadow overlay, just darken slightly
        parts.push(`brightness(${1 + Number(p.amount ?? -30) / 400})`);
        break;
      case 'motion-blur':
        parts.push(`blur(${Number(p['shutter-angle'] ?? 180) / 180}px)`);
        break;
      case 'film-grain':
        // Grain can't be done via CSS filter; apply slight contrast boost as visual hint
        parts.push(`contrast(${1 + Number(p.amount ?? 25) / 500})`);
        break;
      case 'chroma-key':
        // Chroma keying requires pixel-level access; no CSS approximation
        break;
      case 'mosaic':
        // Mosaic pixelation can't be done via CSS filter
        break;
      default:
        break;
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

const VideoLayer: React.FC<{
  currentFrame: number;
  frameRate: number;
  registerVideo?: (clipId: string, el: HTMLVideoElement) => void;
  unregisterVideo?: (clipId: string) => void;
}> = memo(({ currentFrame, frameRate, registerVideo, unregisterVideo }) => {
  const activeSequence = useVinxStore(s => s.getActiveSequence());
  const mediaBin = useVinxStore(s => s.project.mediaBin);
  const colorGrade = useVinxStore(s => s.colorGrade);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Collect all video clips from the sequence
  const videoClips = useMemo(() => {
    const clips: { clip: Clip; media: MediaItem | undefined }[] = [];
    for (const track of activeSequence.tracks) {
      if (track.muted || !track.visible) continue;
      for (const clip of track.clips) {
        if ((clip.type !== 'video' && clip.type !== 'title') || clip.muted) continue;
        const media = clip.mediaId ? mediaBin.find(m => m.id === clip.mediaId) : undefined;
        clips.push({ clip, media });
      }
    }
    return clips;
  }, [activeSequence, mediaBin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoRefs.current.forEach((_, id) => unregisterVideo?.(id));
      videoRefs.current.clear();
    };
  }, [unregisterVideo]);

  const currentSec = frameToSec(currentFrame, frameRate);

  // Build global color grading CSS filter
  const colorGradeFilter = useMemo(() => {
    const parts: string[] = [];
    if (colorGrade.exposure !== 0) parts.push(`brightness(${1 + colorGrade.exposure / 50})`);
    if (colorGrade.contrast !== 0) parts.push(`contrast(${1 + colorGrade.contrast / 100})`);
    if (colorGrade.saturation !== 0) parts.push(`saturate(${1 + colorGrade.saturation / 100})`);
    if (colorGrade.temperature !== 0) parts.push(`sepia(${Math.min(1, Math.abs(colorGrade.temperature) / 150)})`);
    if (colorGrade.highlights !== 0) parts.push(`brightness(${1 + colorGrade.highlights / 200})`);
    if (colorGrade.shadows !== 0) parts.push(`brightness(${1 + colorGrade.shadows / 300})`);
    return parts.length > 0 ? parts.join(' ') : '';
  }, [colorGrade]);

  return (
    <>
      {videoClips.map(({ clip, media }) => {
        const clipStartSec = frameToSec(clip.startFrame, frameRate);
        const clipEndSec = frameToSec(clip.endFrame, frameRate);
        const isVisible = currentSec >= clipStartSec && currentSec < clipEndSec;
        const src = media?.path || media?.proxyPath || '';

        // Transition opacity: fade in/out at clip boundaries
        let transitionOpacity = 1;
        const transIn = clip.transitionIn;
        const transOut = clip.transitionOut;
        if (transIn && isVisible) {
          const transInDur = frameToSec(transIn.durationFrames, frameRate);
          const elapsed = currentSec - clipStartSec;
          if (elapsed < transInDur && transInDur > 0) {
            const t = elapsed / transInDur;
            if (transIn.type === 'dip-to-black' || transIn.type === 'dissolve') transitionOpacity *= t;
            else if (transIn.type === 'dip-to-white') transitionOpacity *= t;
            else transitionOpacity *= Math.min(1, t);
          }
        }
        if (transOut && isVisible) {
          const transOutDur = frameToSec(transOut.durationFrames, frameRate);
          const remaining = clipEndSec - currentSec;
          if (remaining < transOutDur && transOutDur > 0) {
            const t = remaining / transOutDur;
            if (transOut.type === 'dip-to-black' || transOut.type === 'dissolve') transitionOpacity *= t;
            else if (transOut.type === 'dip-to-white') transitionOpacity *= t;
            else transitionOpacity *= Math.min(1, t);
          }
        }

        // Combine clip effects + color grading
        const effectFilter = buildClipCSSFilter(clip.effects);
        const combinedFilter = [effectFilter !== 'none' ? effectFilter : '', colorGradeFilter].filter(Boolean).join(' ') || 'none';

        return (
          <React.Fragment key={clip.id}>
            {/* Title clip overlay */}
            {clip.type === 'title' && clip.titleData && isVisible && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: clip.opacity * transitionOpacity, pointerEvents: 'none', zIndex: 2,
              }}>
                <span style={{
                  fontSize: clip.titleData.fontSize || 48, fontWeight: (clip.titleData.fontWeight || 700) as number,
                  fontFamily: clip.titleData.fontFamily || 'system-ui', color: clip.titleData.color || 'var(--color-text-primary)',
                  textAlign: (clip.titleData.alignment || 'center') as React.CSSProperties['textAlign'],
                  textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}>{clip.titleData.text}</span>
              </div>
            )}
            {/* Clip placeholder — gradient scene when no media loaded */}
            {clip.type === 'video' && !src && isVisible && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${clip.color || '#1a1a2e'} 0%, #16213e 50%, #0f3460 100%)`,
                opacity: clip.opacity * transitionOpacity,
                transform: `translate(${clip.transform.positionX}px, ${clip.transform.positionY}px) scale(${clip.transform.scaleX}, ${clip.transform.scaleY}) rotate(${clip.transform.rotation}deg)`,
                filter: combinedFilter, pointerEvents: 'none',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>{clip.name}</div>
                </div>
              </div>
            )}
            {/* Real video element */}
            {clip.type === 'video' && src && (
            <video
              data-vinx-preview="true"
              ref={(el) => {
                if (el) {
                  if (!videoRefs.current.has(clip.id)) {
                    videoRefs.current.set(clip.id, el);
                    registerVideo?.(clip.id, el);
                  }
                } else {
                  if (videoRefs.current.has(clip.id)) {
                    videoRefs.current.delete(clip.id);
                    unregisterVideo?.(clip.id);
                  }
                }
              }}
              src={src}
              muted
              playsInline
              preload="auto"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: isVisible ? 'block' : 'none',
                opacity: clip.opacity * transitionOpacity,
                transform: `translate(${clip.transform.positionX}px, ${clip.transform.positionY}px) scale(${clip.transform.scaleX}, ${clip.transform.scaleY}) rotate(${clip.transform.rotation}deg)`,
                filter: combinedFilter,
                pointerEvents: 'none',
              }}
            />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
});

VideoLayer.displayName = 'VideoLayer';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const viewerContainerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
  background: 'var(--color-bg-base)',
};

const viewerTabBarStyle: React.CSSProperties = {
  display: 'flex', height: 24, flexShrink: 0, background: 'var(--color-bg-base)',
  borderBottom: '1px solid var(--color-bg-hover)',
  overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
};

const viewerTabStyle = (active: boolean): React.CSSProperties => ({
  padding: '0 var(--space-3)', display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.02em', textTransform: 'uppercase',
  color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', cursor: 'pointer', userSelect: 'none',
  borderBottom: active ? '1px solid var(--color-accent, #4A9EFF)' : '1px solid transparent',
  whiteSpace: 'nowrap', flexShrink: 0,
});

const canvasContainerStyle: React.CSSProperties = {
  flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  overflow: 'hidden', position: 'relative', background: 'var(--color-bg-base)',
};

const controlsBarStyle: React.CSSProperties = {
  height: 32, display: 'flex', alignItems: 'center', gap: 2, padding: '0 var(--space-2)',
  flexShrink: 0, background: 'var(--color-bg-base)', borderTop: '1px solid var(--color-bg-hover)',
  minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
};

const timecodeStyle: React.CSSProperties = {
  fontSize: 11, fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums slashed-zero', color: 'var(--color-text-primary)',
  minWidth: 72, textAlign: 'center', letterSpacing: '0.02em', flexShrink: 0,
};

const scrubberContainerStyle: React.CSSProperties = {
  height: 20, display: 'flex', alignItems: 'center', padding: '0 var(--space-2)',
  flexShrink: 0, background: 'var(--color-bg-base)',
};

const scrubberTrackStyle: React.CSSProperties = {
  flex: 1, height: 4, background: 'var(--color-bg-hover)', borderRadius: 2,
  position: 'relative', cursor: 'pointer',
};

const transportBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-secondary)', width: 24, height: 24, flexShrink: 0,
};

// ---------------------------------------------------------------------------
// TRANSPORT ICONS
// ---------------------------------------------------------------------------

const SkipBackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 3h2v10H3zM7 8l7-5v10z" />
  </svg>
);

const StepBackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3h2v10H4zM8 8l6-4v8z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2l10 6-10 6z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 2h4v12H3zM9 2h4v12H9z" />
  </svg>
);

const StopIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" />
  </svg>
);

const StepForwardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M10 3h2v10h-2zM2 8l6-4v8z" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11 3h2v10h-2zM2 8l7-5v10z" />
  </svg>
);

const LoopIcon = ({ active }: { active: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={active ? 'var(--color-accent)' : 'currentColor'} strokeWidth="1.5">
    <path d="M2 8a6 6 0 0110-4.5M14 8a6 6 0 01-10 4.5" />
    <path d="M12 2v3h-3M4 14v-3h3" />
  </svg>
);

const FullscreenIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
  </svg>
);

// ---------------------------------------------------------------------------
// OVERLAY BUTTONS
// ---------------------------------------------------------------------------

const overlayBtnStyle = (active: boolean): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
  fontSize: 10, color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
  fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0,
});

// ---------------------------------------------------------------------------
// SAFE ZONE OVERLAY
// ---------------------------------------------------------------------------

const SafeZoneOverlay: React.FC<{ width: number; height: number }> = memo(({ width, height }) => {
  const titleSafe = { x: width * 0.1, y: height * 0.1, w: width * 0.8, h: height * 0.8 };
  const actionSafe = { x: width * 0.05, y: height * 0.05, w: width * 0.9, h: height * 0.9 };

  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x={titleSafe.x} y={titleSafe.y} width={titleSafe.w} height={titleSafe.h}
        fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1" strokeDasharray="4 4" />
      <rect x={actionSafe.x} y={actionSafe.y} width={actionSafe.w} height={actionSafe.h}
        fill="none" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="2 4" />
      <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke="var(--color-border)" strokeWidth="1" />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-border)" strokeWidth="1" />
    </svg>
  );
});

SafeZoneOverlay.displayName = 'SafeZoneOverlay';

// ---------------------------------------------------------------------------
// SCRUBBER
// ---------------------------------------------------------------------------

const Scrubber: React.FC<{
  currentFrame: number;
  duration: number;
  onSeek: (frame: number) => void;
}> = memo(({ currentFrame, duration, onSeek }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const progress = duration > 0 ? currentFrame / duration : 0;

  const frameFromEvent = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * duration);
  }, [duration]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onSeek(frameFromEvent(e));
  }, [frameFromEvent, onSeek]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    onSeek(frameFromEvent(e));
  }, [frameFromEvent, onSeek]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div style={scrubberContainerStyle}>
      <div
        ref={trackRef}
        style={scrubberTrackStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${progress * 100}%`, background: 'var(--color-accent)', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
          left: `${progress * 100}%`,
          width: 8, height: 8, borderRadius: 4, background: 'var(--color-text-primary)',
        }} />
      </div>
    </div>
  );
});

Scrubber.displayName = 'Scrubber';

// ---------------------------------------------------------------------------
// SINGLE VIEWER PANEL
// ---------------------------------------------------------------------------

const ViewerPanel: React.FC<{
  label: string;
  currentFrame: number;
  duration: number;
  frameRate: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  canvasRef?: React.Ref<HTMLDivElement>;
  projectWidth: number;
  projectHeight: number;
  registerVideo?: (clipId: string, el: HTMLVideoElement) => void;
  unregisterVideo?: (clipId: string) => void;
}> = memo(({
  label, currentFrame, duration, frameRate, isPlaying,
  onPlay, onPause, onStop, onSeek,
  onStepBack, onStepForward, onSkipBack, onSkipForward,
  loopEnabled, onToggleLoop, canvasRef, projectWidth, projectHeight,
  registerVideo, unregisterVideo,
}) => {
  const overlay = useVinxStore(s => s.viewerOverlay);
  const setOverlay = useVinxStore(s => s.setViewerOverlay);
  const programLUT = useVinxStore(s => s.programLUT);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 640, h: 360 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const aspect = projectWidth > 0 && projectHeight > 0 ? projectWidth / projectHeight : 16 / 9;
  const fitWidth = containerSize.h * aspect;
  const fitHeight = containerSize.w / aspect;
  const actualWidth = fitWidth <= containerSize.w ? fitWidth : containerSize.w;
  const actualHeight = fitWidth <= containerSize.w ? containerSize.h : fitHeight;

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen().catch((e: unknown) => { console.warn('[DEX]', e); });
      }
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
      {/* Label bar */}
      <div style={{
        height: 20, display: 'flex', alignItems: 'center', padding: '0 var(--space-2)',
        fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.04em',
        textTransform: 'uppercase', flexShrink: 0, background: 'var(--color-bg-base)',
        justifyContent: 'space-between', gap: 'var(--space-2)', minWidth: 0,
      }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', flexShrink: 0 }}>
          <button aria-label="Toggle safe zones overlay" aria-pressed={overlay === 'safe-zones'} style={overlayBtnStyle(overlay === 'safe-zones')} onClick={() => setOverlay(overlay === 'safe-zones' ? 'none' : 'safe-zones')}>Safe</button>
          <button aria-label="Toggle grid overlay" aria-pressed={overlay === 'grid'} style={overlayBtnStyle(overlay === 'grid')} onClick={() => setOverlay(overlay === 'grid' ? 'none' : 'grid')}>Grid</button>
          <button aria-label="Toggle fullscreen" style={{ ...overlayBtnStyle(false), display: 'flex', alignItems: 'center' }} onClick={handleFullscreen}>
            <FullscreenIcon />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} style={canvasContainerStyle}>
        <div
          ref={canvasRef}
          data-vinx-program-canvas
          style={{
            width: actualWidth, height: actualHeight,
            background: 'var(--color-bg-base)', position: 'relative', overflow: 'hidden',
            // Program LUT (store-driven so it survives re-renders; Quick
            // Export bakes the same filter into the rendered frames)
            filter: programLUT?.cssFilter && programLUT.cssFilter !== 'none' ? programLUT.cssFilter : undefined,
          }}
        >
          <VideoLayer
            currentFrame={currentFrame}
            frameRate={frameRate}
            registerVideo={registerVideo}
            unregisterVideo={unregisterVideo}
          />
          {overlay === 'safe-zones' && <SafeZoneOverlay width={actualWidth} height={actualHeight} />}
          {overlay === 'grid' && (
            <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={actualWidth} height={actualHeight}>
              {[1, 2].map(i => (
                <React.Fragment key={i}>
                  <line x1={actualWidth * i / 3} y1={0} x2={actualWidth * i / 3} y2={actualHeight} stroke="var(--color-border)" strokeWidth="1" />
                  <line x1={0} y1={actualHeight * i / 3} x2={actualWidth} y2={actualHeight * i / 3} stroke="var(--color-border)" strokeWidth="1" />
                </React.Fragment>
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* Scrubber */}
      <Scrubber currentFrame={currentFrame} duration={duration} onSeek={onSeek} />

      {/* Transport controls */}
      <div style={controlsBarStyle}>
        <div style={timecodeStyle}>{formatTimecode(currentFrame, frameRate)}</div>
        <div style={{ flex: '1 1 8px', minWidth: 8 }} />
        <button aria-label="Skip to start" style={transportBtnStyle} onClick={onSkipBack}><SkipBackIcon /></button>
        <button aria-label="Previous frame" style={transportBtnStyle} onClick={onStepBack}><StepBackIcon /></button>
        {isPlaying ? (
          <button aria-label="Pause" style={{ ...transportBtnStyle, color: 'var(--color-accent)' }} onClick={onPause}><PauseIcon /></button>
        ) : (
          <button aria-label="Play" style={{ ...transportBtnStyle, color: 'var(--color-text-primary)' }} onClick={onPlay}><PlayIcon /></button>
        )}
        <button aria-label="Stop" style={transportBtnStyle} onClick={onStop}><StopIcon /></button>
        <button aria-label="Next frame" style={transportBtnStyle} onClick={onStepForward}><StepForwardIcon /></button>
        <button aria-label="Skip to end" style={transportBtnStyle} onClick={onSkipForward}><SkipForwardIcon /></button>
        <button aria-label="Toggle loop" aria-pressed={loopEnabled} style={{ ...transportBtnStyle, color: loopEnabled ? 'var(--color-accent)' : 'var(--color-text-secondary)' }} onClick={onToggleLoop}><LoopIcon active={loopEnabled} /></button>
        <div style={{ flex: '1 1 8px', minWidth: 8 }} />
        <div style={{ ...timecodeStyle, color: 'var(--color-text-tertiary)' }}>{formatTimecode(duration, frameRate)}</div>
      </div>
    </div>
  );
});

ViewerPanel.displayName = 'ViewerPanel';

// ---------------------------------------------------------------------------
// VIEWER (MAIN EXPORT)
// ---------------------------------------------------------------------------

export const Viewer: React.FC<{
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (frame: number) => void;
  programCanvasRef?: React.Ref<HTMLDivElement>;
  sourceCanvasRef?: React.Ref<HTMLDivElement>;
  registerVideo?: (clipId: string, el: HTMLVideoElement) => void;
  unregisterVideo?: (clipId: string) => void;
}> = memo(({ onPlay, onPause, onStop, onSeek, programCanvasRef, sourceCanvasRef, registerVideo, unregisterVideo }) => {
  const currentFrame = useVinxStore(s => s.currentFrame);
  const isPlaying = useVinxStore(s => s.isPlaying);
  const loopEnabled = useVinxStore(s => s.loopEnabled);
  const toggleLoop = useVinxStore(s => s.toggleLoop);
  const frameRate = useVinxStore(s => s.project.frameRate);
  const projectWidth = useVinxStore(s => s.project.width);
  const projectHeight = useVinxStore(s => s.project.height);
  const duration = useVinxStore(s => s.getSequenceDuration());
  const viewerMode = useVinxStore(s => s.project.panelLayout.viewerMode);
  const sourceFrame = useVinxStore(s => s.sourceViewerFrame);
  const setSourceFrame = useVinxStore(s => s.setSourceViewerFrame);

  const [activeViewer, setActiveViewer] = useState<'source' | 'program'>('program');
  const [sourceIsPlaying, setSourceIsPlaying] = useState(false);
  const [sourceLoopEnabled, setSourceLoopEnabled] = useState(false);
  const sourcePlayRef = useRef<number>(0);

  // Source viewer playback timer
  useEffect(() => {
    if (sourceIsPlaying) {
      sourcePlayRef.current = window.setInterval(() => {
        const next = useVinxStore.getState().sourceViewerFrame + 1;
        const dur = useVinxStore.getState().getSequenceDuration();
        if (next > dur) {
          if (sourceLoopEnabled) {
            setSourceFrame(0);
          } else {
            setSourceIsPlaying(false);
          }
        } else {
          setSourceFrame(next);
        }
      }, 1000 / frameRate);
    }
    return () => { if (sourcePlayRef.current) clearInterval(sourcePlayRef.current); };
  }, [sourceIsPlaying, sourceLoopEnabled, frameRate, setSourceFrame]);

  const handleStepBack = useCallback(() => onSeek(Math.max(0, currentFrame - 1)), [currentFrame, onSeek]);
  const handleStepForward = useCallback(() => onSeek(currentFrame + 1), [currentFrame, onSeek]);
  const handleSkipBack = useCallback(() => onSeek(0), [onSeek]);
  const handleSkipForward = useCallback(() => onSeek(duration), [duration, onSeek]);

  const handleSourceStepBack = useCallback(() => setSourceFrame(Math.max(0, sourceFrame - 1)), [sourceFrame, setSourceFrame]);
  const handleSourceStepForward = useCallback(() => setSourceFrame(sourceFrame + 1), [sourceFrame, setSourceFrame]);
  const handleSourceSkipBack = useCallback(() => setSourceFrame(0), [setSourceFrame]);
  const handleSourceSkipForward = useCallback(() => setSourceFrame(duration), [duration, setSourceFrame]);

  if (viewerMode === 'dual') {
    return (
      <div data-testid="vinx-viewer" style={viewerContainerStyle}>
        <div style={viewerTabBarStyle}>
          <div style={viewerTabStyle(activeViewer === 'source')} onClick={() => setActiveViewer('source')}>Source</div>
          <div style={viewerTabStyle(activeViewer === 'program')} onClick={() => setActiveViewer('program')}>Program</div>
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Source */}
          <ViewerPanel
            label="Source"
            currentFrame={sourceFrame}
            duration={duration}
            frameRate={frameRate}
            isPlaying={sourceIsPlaying}
            onPlay={() => setSourceIsPlaying(true)}
            onPause={() => setSourceIsPlaying(false)}
            onStop={() => { setSourceIsPlaying(false); setSourceFrame(0); }}
            onSeek={setSourceFrame}
            onStepBack={handleSourceStepBack}
            onStepForward={handleSourceStepForward}
            onSkipBack={handleSourceSkipBack}
            onSkipForward={handleSourceSkipForward}
            loopEnabled={sourceLoopEnabled}
            onToggleLoop={() => setSourceLoopEnabled(v => !v)}
            canvasRef={sourceCanvasRef}
            projectWidth={projectWidth}
            projectHeight={projectHeight}
          />
          <div style={{ width: 1, background: 'var(--color-bg-hover)', flexShrink: 0 }} />
          {/* Program */}
          <ViewerPanel
            label="Program"
            currentFrame={currentFrame}
            duration={duration}
            frameRate={frameRate}
            isPlaying={isPlaying}
            onPlay={onPlay}
            onPause={onPause}
            onStop={onStop}
            onSeek={onSeek}
            onStepBack={handleStepBack}
            onStepForward={handleStepForward}
            onSkipBack={handleSkipBack}
            onSkipForward={handleSkipForward}
            loopEnabled={loopEnabled}
            onToggleLoop={toggleLoop}
            canvasRef={programCanvasRef}
            projectWidth={projectWidth}
            projectHeight={projectHeight}
            registerVideo={registerVideo}
            unregisterVideo={unregisterVideo}
          />
        </div>
      </div>
    );
  }

  // Single viewer (program only)
  return (
    <div data-testid="vinx-viewer" style={viewerContainerStyle}>
      <ViewerPanel
        label="Program"
        currentFrame={currentFrame}
        duration={duration}
        frameRate={frameRate}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
        onSeek={onSeek}
        onStepBack={handleStepBack}
        onStepForward={handleStepForward}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        loopEnabled={loopEnabled}
        onToggleLoop={toggleLoop}
        canvasRef={programCanvasRef}
        projectWidth={projectWidth}
        projectHeight={projectHeight}
        registerVideo={registerVideo}
        unregisterVideo={unregisterVideo}
      />
    </div>
  );
});

Viewer.displayName = 'Viewer';
