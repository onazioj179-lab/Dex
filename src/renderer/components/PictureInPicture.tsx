// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Picture-in-Picture (PiP) Video Player
 * A smooth, draggable floating video player with momentum drag,
 * edge snapping, and intuitive controls.
 */

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import DexIcon from './DexIcon';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface PiPProps {
  src: string;
  poster?: string;
  title?: string;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
}

interface Position { x: number; y: number }
interface Size { width: number; height: number }

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const MIN_WIDTH = 240;
const MIN_HEIGHT = 135;
const MAX_WIDTH = 640;
const MAX_HEIGHT = 360;
const SNAP_THRESHOLD = 24;
const MOMENTUM_FRICTION = 0.92;
const EDGE_MARGIN = 12;

// Smooth spring constants for momentum
const SPRING_TENSION = 0.15;
const SPRING_DAMPING = 0.8;

// ---------------------------------------------------------------------------
// PIP VIDEO COMPONENT
// ---------------------------------------------------------------------------

export const PictureInPicture: React.FC<PiPProps> = memo(({
  src,
  poster,
  title = 'Video',
  onClose,
  initialPosition,
  initialSize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Position & Size State
  const [pos, setPos] = useState<Position>(() => {
    if (initialPosition) return initialPosition;
    // Default: bottom-right corner
    const x = window.innerWidth - 360 - EDGE_MARGIN;
    const y = window.innerHeight - 220 - 80; // 80 for dock
    return { x, y };
  });
  const [size, setSize] = useState<Size>(initialSize ?? { width: 320, height: 180 });

  // Interaction state
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Video state
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);

  // Refs for smooth drag
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastPosRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const momentumRafRef = useRef<number>(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls
  useEffect(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!hovered && playing) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 2500);
    } else {
      setShowControls(true);
    }
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [hovered, playing]);

  // -------------------------------------------------------------------------
  // SMOOTH DRAG WITH MOMENTUM
  // -------------------------------------------------------------------------

  const clampPosition = useCallback((x: number, y: number, w: number, h: number): Position => {
    const maxX = window.innerWidth - w - EDGE_MARGIN;
    const maxY = window.innerHeight - h - 80; // Dock space
    return {
      x: Math.max(EDGE_MARGIN, Math.min(maxX, x)),
      y: Math.max(EDGE_MARGIN, Math.min(maxY, y)),
    };
  }, []);

  const snapToEdge = useCallback((x: number, y: number, w: number, h: number): Position => {
    let snappedX = x;
    let snappedY = y;
    const maxX = window.innerWidth - w - EDGE_MARGIN;
    const maxY = window.innerHeight - h - 80;

    // Snap to edges
    if (x < SNAP_THRESHOLD + EDGE_MARGIN) snappedX = EDGE_MARGIN;
    else if (x > maxX - SNAP_THRESHOLD) snappedX = maxX;

    if (y < SNAP_THRESHOLD + EDGE_MARGIN) snappedY = EDGE_MARGIN;
    else if (y > maxY - SNAP_THRESHOLD) snappedY = maxY;

    return { x: snappedX, y: snappedY };
  }, []);

  const applyMomentum = useCallback(() => {
    const vel = velocityRef.current;
    const threshold = 0.5;

    if (Math.abs(vel.x) < threshold && Math.abs(vel.y) < threshold) {
      // Snap to nearest edge when momentum stops
      const snapped = snapToEdge(posRef.current.x, posRef.current.y, sizeRef.current.width, sizeRef.current.height);
      if (snapped.x !== posRef.current.x || snapped.y !== posRef.current.y) {
        animateToPosition(snapped.x, snapped.y);
      }
      return;
    }

    vel.x *= MOMENTUM_FRICTION;
    vel.y *= MOMENTUM_FRICTION;

    const newPos = clampPosition(
      posRef.current.x + vel.x,
      posRef.current.y + vel.y,
      sizeRef.current.width,
      sizeRef.current.height
    );

    setPos(newPos);
    momentumRafRef.current = requestAnimationFrame(applyMomentum);
  }, [clampPosition, snapToEdge]);

  const animateToPosition = useCallback((targetX: number, targetY: number) => {
    const animate = () => {
      const dx = targetX - posRef.current.x;
      const dy = targetY - posRef.current.y;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        setPos({ x: targetX, y: targetY });
        return;
      }

      setPos({
        x: posRef.current.x + dx * SPRING_TENSION,
        y: posRef.current.y + dy * SPRING_TENSION,
      });
      momentumRafRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
    
    setDragging(true);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    
    dragOffsetRef.current = {
      x: e.clientX - posRef.current.x,
      y: e.clientY - posRef.current.y,
    };
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = { x: 0, y: 0 };

    // Live position for RAF
    const livePos = { x: posRef.current.x, y: posRef.current.y };
    let rafScheduled = false;

    const onMove = (ev: PointerEvent) => {
      const newX = ev.clientX - dragOffsetRef.current.x;
      const newY = ev.clientY - dragOffsetRef.current.y;
      
      // Calculate velocity for momentum
      velocityRef.current = {
        x: (velocityRef.current.x * 0.5) + (ev.clientX - lastPosRef.current.x) * 0.5,
        y: (velocityRef.current.y * 0.5) + (ev.clientY - lastPosRef.current.y) * 0.5,
      };
      lastPosRef.current = { x: ev.clientX, y: ev.clientY };

      const clamped = clampPosition(newX, newY, sizeRef.current.width, sizeRef.current.height);
      livePos.x = clamped.x;
      livePos.y = clamped.y;

      if (!rafScheduled) {
        rafScheduled = true;
        rafRef.current = requestAnimationFrame(() => {
          rafScheduled = false;
          if (containerRef.current) {
            containerRef.current.style.left = `${livePos.x}px`;
            containerRef.current.style.top = `${livePos.y}px`;
          }
        });
      }
    };

    const onUp = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setDragging(false);
      
      // Commit position
      const finalX = ev.clientX - dragOffsetRef.current.x;
      const finalY = ev.clientY - dragOffsetRef.current.y;
      const clamped = clampPosition(finalX, finalY, sizeRef.current.width, sizeRef.current.height);
      setPos(clamped);
      
      // Apply momentum if there's velocity
      if (Math.abs(velocityRef.current.x) > 2 || Math.abs(velocityRef.current.y) > 2) {
        momentumRafRef.current = requestAnimationFrame(applyMomentum);
      } else {
        // Snap to edge
        const snapped = snapToEdge(clamped.x, clamped.y, sizeRef.current.width, sizeRef.current.height);
        if (snapped.x !== clamped.x || snapped.y !== clamped.y) {
          animateToPosition(snapped.x, snapped.y);
        }
      }
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [clampPosition, snapToEdge, applyMomentum, animateToPosition]);

  // -------------------------------------------------------------------------
  // RESIZE HANDLER
  // -------------------------------------------------------------------------

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = sizeRef.current.width;
    const startH = sizeRef.current.height;
    const aspectRatio = startW / startH;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      
      // Maintain aspect ratio
      let newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx));
      let newH = newW / aspectRatio;
      
      if (newH > MAX_HEIGHT) {
        newH = MAX_HEIGHT;
        newW = newH * aspectRatio;
      }
      if (newH < MIN_HEIGHT) {
        newH = MIN_HEIGHT;
        newW = newH * aspectRatio;
      }
      
      setSize({ width: newW, height: newH });
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setResizing(false);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  // -------------------------------------------------------------------------
  // VIDEO CONTROLS
  // -------------------------------------------------------------------------

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = volume / 100;
      videoRef.current.play().catch(() => setPlaying(false));
    }
  }, [volume]);

  const seekTo = useCallback((pct: number) => {
    if (!videoRef.current || !duration) return;
    videoRef.current.currentTime = (pct / 100) * duration;
  }, [duration]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const next = !muted;
    setMuted(next);
    videoRef.current.muted = next;
  }, [muted]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (momentumRafRef.current) cancelAnimationFrame(momentumRafRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex: 9900,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
        background: '#000',
        cursor: dragging ? 'grabbing' : 'default',
        transition: dragging || resizing ? 'none' : 'box-shadow 0.2s ease',
        transform: 'translateZ(0)',
        willChange: dragging ? 'left, top' : 'auto',
      }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          cursor: 'pointer',
        }}
      />

      {/* Drag Handle (Top bar) */}
      <div
        onPointerDown={handleDragStart}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 40,
          height: 36,
          cursor: 'grab',
          background: showControls ? 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, transparent 100%)' : 'transparent',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
        }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.9)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
      </div>

      {/* Close Button */}
      <button
        onClick={onClose}
        aria-label="Close PiP"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 28,
          height: 28,
          borderRadius: 14,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.2s ease, background 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,69,58,0.8)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.5)')}
      >
        <DexIcon name="close" size={12} />
      </button>

      {/* Controls Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '8px 10px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {/* Progress Bar */}
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            seekTo(pct);
          }}
          style={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.2)',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--color-accent, #0A84FF)',
            borderRadius: 2,
            transition: 'width 0.1s linear',
          }} />
        </div>

        {/* Control Buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DexIcon name={playing ? 'pause' : 'play'} size={12} />
            </button>
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DexIcon name={muted ? 'volume-x' : 'volume-2'} size={12} />
            </button>
          </div>

          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
          }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        onPointerDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 20,
          height: 20,
          cursor: 'nwse-resize',
          opacity: showControls ? 0.5 : 0,
          transition: 'opacity 0.2s ease',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="rgba(255,255,255,0.4)" style={{ position: 'absolute', bottom: 4, right: 4 }}>
          <path d="M11 11H9V9H11V11ZM11 7H9V5H11V7ZM7 11H5V9H7V11Z" />
        </svg>
      </div>
    </div>
  );
});

PictureInPicture.displayName = 'PictureInPicture';

// ---------------------------------------------------------------------------
// PIP STORE / CONTEXT (for global PiP state management)
// ---------------------------------------------------------------------------

export interface PiPState {
  active: boolean;
  src: string;
  poster?: string;
  title?: string;
}

let globalPiPState: PiPState | null = null;
const pipListeners = new Set<(state: PiPState | null) => void>();

export function openPiP(src: string, title?: string, poster?: string): void {
  globalPiPState = { active: true, src, poster, title };
  pipListeners.forEach(fn => fn(globalPiPState));
}

export function closePiP(): void {
  globalPiPState = null;
  pipListeners.forEach(fn => fn(null));
}

export function usePiPState(): PiPState | null {
  const [state, setState] = React.useState<PiPState | null>(globalPiPState);
  
  React.useEffect(() => {
    const listener = (s: PiPState | null) => setState(s);
    pipListeners.add(listener);
    return () => { pipListeners.delete(listener); };
  }, []);
  
  return state;
}

export default PictureInPicture;
