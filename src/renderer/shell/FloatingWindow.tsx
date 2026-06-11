// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Floating Window
 * A detachable, resizable, draggable window chrome component
 * with snapping, depth management, momentum dragging, and genie minimize.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { SpringAnimator, SPRING_PRESETS, isReduceMotion } from '../utils/MotionController';
import * as Depth from './WindowDepthManager';
import { playLift } from './SpatialAudio';
import { isOperationActive, deferDuringOperation } from '../services/FluidOperations';
import { detectZone as snapDetectZone, rectForZone as snapRectForZone, makeEnv as snapMakeEnv, type SnapZone as EngineSnapZone } from './snapEngine';
import { platform } from '../utils';

// Throttle interval for snap zone detection (ms) - increased for better perf under memory pressure
const SNAP_DETECT_THROTTLE_MS = 64;

// GPU compositing hints - minimal for memory efficiency
const GPU_HINTS = {
  willChange: 'auto',
  backfaceVisibility: 'hidden' as const,
} as const;

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface FloatingWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  snapZone: SnapZone | null;
}

export type SnapZone = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'full';

export interface FloatingWindowProps {
  id: string;
  title: string;
  /** Initial position & size */
  initialState?: Partial<FloatingWindowState>;
  /** Minimum dimensions */
  minWidth?: number;
  minHeight?: number;
  /** Whether this window is the active (focused) one */
  active: boolean;
  /** Dock icon bounding rect for genie animation target */
  dockIconRect?: DOMRect | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onStateChange?: (id: string, state: FloatingWindowState) => void;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// SNAP ZONE CONSTANTS
// ---------------------------------------------------------------------------
// Geometry is delegated to src/renderer/shell/snapEngine.ts so this component,
// StageManager, and a future tiling overlay all share one source of truth.

const SAFE_TOP = 0;
const SAFE_GUTTER = 0;

/**
 * Read the dock-reserved insets that AppManager publishes on `<html>` as
 * CSS variables. Falls back to zero when the variables are absent (e.g. in
 * unit tests or before AppManager mounts) so behavior is identical to before.
 */
function getReservedInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string): number => {
    const raw = cs.getPropertyValue(name).trim();
    if (!raw) return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    top: read('--dex-reserved-top'),
    right: read('--dex-reserved-right'),
    bottom: read('--dex-reserved-bottom'),
    left: read('--dex-reserved-left'),
  };
}

/** Bounds for a fully-maximized window that respects the dock reservation. */
function getMaximizedBounds(): { x: number; y: number; width: number; height: number } {
  const r = getReservedInsets();
  const x = SAFE_GUTTER + r.left;
  const y = SAFE_TOP + r.top;
  const width = Math.max(0, window.innerWidth - r.left - r.right - SAFE_GUTTER * 2);
  const height = Math.max(0, window.innerHeight - r.top - r.bottom - SAFE_TOP - SAFE_GUTTER);
  return { x, y, width, height };
}

/** Map snapEngine's 13-zone vocabulary back onto FloatingWindow's 7-zone API. */
function normalizeZone(z: EngineSnapZone | null): SnapZone | null {
  if (!z) return null;
  switch (z) {
    case 'left':
    case 'right':
    case 'full':
    case 'top-left':
    case 'top-right':
    case 'bottom-left':
    case 'bottom-right':
      return z;
    // Thirds: collapse to halves so the existing FloatingWindow behavior is preserved.
    case 'left-third':   return 'left';
    case 'right-third':  return 'right';
    case 'center-third': return null;
    // Stash variants are not yet wired in FloatingWindow; treat as no-snap.
    case 'stash-left':
    case 'stash-right':
    case 'stash-bottom':
      return null;
  }
}

function detectSnapZone(x: number, y: number, windowWidth: number, windowHeight: number): SnapZone | null {
  const r = getReservedInsets();
  const env = snapMakeEnv(windowWidth, windowHeight, {
    top: SAFE_TOP + r.top,
    left: SAFE_GUTTER + r.left,
    right: SAFE_GUTTER + r.right,
    bottom: SAFE_GUTTER + r.bottom,
  });
  return normalizeZone(snapDetectZone(x, y, env));
}

function getSnapBounds(zone: SnapZone): { x: number; y: number; width: number; height: number } {
  const r = getReservedInsets();
  const env = snapMakeEnv(window.innerWidth, window.innerHeight, {
    top: SAFE_TOP + r.top,
    left: SAFE_GUTTER + r.left,
    right: SAFE_GUTTER + r.right,
    bottom: SAFE_GUTTER + r.bottom,
  });
  return snapRectForZone(zone, env);
}

function clampWindowPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const r = getReservedInsets();
  const visibleInset = 40;
  const minX = -(Math.max(0, width - visibleInset)) + r.left;
  const minY = r.top;
  const maxX = Math.max(0, window.innerWidth - visibleInset - r.right);
  const maxY = Math.max(0, window.innerHeight - visibleInset - r.bottom);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

// ---------------------------------------------------------------------------
// SNAP PREVIEW
// ---------------------------------------------------------------------------

export const SnapPreview: React.FC<{ zone: SnapZone | null }> = ({ zone }) => {
  if (!zone) return null;
  const bounds = getSnapBounds(zone);
  return (
    <div
      style={{
        position: 'fixed',
        left: bounds.x + 6,
        top: bounds.y + 6,
        width: bounds.width - 12,
        height: bounds.height - 12,
        borderRadius: 10,
        border: '2px solid var(--color-accent)',
        background: 'rgba(74,158,255,0.08)',
        boxShadow: '0 0 24px rgba(74,158,255,0.15)',
        pointerEvents: 'none',
        zIndex: 'var(--z-modal)',
        transition: isReduceMotion() ? 'none' : 'all 0.22s cubic-bezier(0.23, 1, 0.32, 1)',
        animation: isReduceMotion() ? 'none' : 'dex-snap-zone-pulse 1.5s ease-in-out infinite',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// FLOATING WINDOW COMPONENT
// ---------------------------------------------------------------------------

export const FloatingWindow: React.FC<FloatingWindowProps> = ({
  id,
  title,
  initialState,
  minWidth = 200,
  minHeight = 150,
  active,
  dockIconRect,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onStateChange,
  children,
}) => {
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: initialState?.x ?? 80, y: initialState?.y ?? 80 });
  const [size, setSize] = useState({ width: initialState?.width ?? 800, height: initialState?.height ?? 600 });
  const [minimized, setMinimized] = useState(initialState?.minimized ?? false);
  const [maximized, setMaximized] = useState(initialState?.maximized ?? false);
  const [snapZone, setSnapZone] = useState<SnapZone | null>(initialState?.snapZone ?? null);
  const [previewZone, setPreviewZone] = useState<SnapZone | null>(null);
  const [edgeGlow, setEdgeGlow] = useState<string | null>(null);
  const [sizeTooltip, setSizeTooltip] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  // Forces a re-render when the viewport changes so maximize bounds reflow.
  const [, setReflowTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setReflowTick((t) => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Live refs for pos/size — avoid stale closures in drag/resize handlers
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;
  const maximizedRef = useRef(maximized);
  maximizedRef.current = maximized;
  const snapZoneRef = useRef(snapZone);
  snapZoneRef.current = snapZone;
  const previewZoneRef = useRef<SnapZone | null>(previewZone);
  previewZoneRef.current = previewZone;

  // State before snap/maximize for restoration
  const preSnapRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragRafRef = useRef<number>(0);
  const resizeDirRef = useRef<string>('');
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });
  const resizeRafRef = useRef<number>(0);
  const sizeTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Active resize-drag listener cleanup. Set while a resize gesture is in
  // flight; called from both onUp and the component's unmount effect so
  // closing a window mid-drag does not leak document listeners.
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  // Shake detection
  const shakeHistoryRef = useRef<{ x: number; ts: number }[]>([]);
  
  // Throttled snap detection
  const lastSnapCheckRef = useRef<number>(0);

  const zIndex = Depth.getDepth(id);

  // Debounced state persistence
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      onStateChange?.(id, {
        ...posRef.current,
        ...sizeRef.current,
        minimized: minimizedRef.current,
        maximized: maximizedRef.current,
        snapZone: snapZoneRef.current,
      });
    }, 220);
  }, [id, onStateChange]);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    onStateChange?.(id, {
      ...posRef.current,
      ...sizeRef.current,
      minimized: minimizedRef.current,
      maximized: maximizedRef.current,
      snapZone: snapZoneRef.current,
    });
  }, [id, onStateChange]);

  const persistState = useCallback(() => {
    if (dragging || resizing) return;
    schedulePersist();
  }, [dragging, resizing, schedulePersist]);

  useEffect(() => { persistState(); }, [pos, size, minimized, maximized, snapZone, persistState]);

  // Clean up persist timer and any in-flight drag/resize listeners on unmount.
  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    if (sizeTooltipTimerRef.current) clearTimeout(sizeTooltipTimerRef.current);
    if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    if (resizeCleanupRef.current) {
      resizeCleanupRef.current();
      resizeCleanupRef.current = null;
    }
  }, []);

  // Focus on click
  const handleFocus = useCallback(() => {
    Depth.bringToFront(id);
    onFocus(id);
    if (windowRef.current) {
      playLift(windowRef.current.getBoundingClientRect().left + size.width / 2);
    }
  }, [id, onFocus, size.width]);

  // -----------------------------------------------------------------------
  // TITLE BAR DRAGGING
  // -----------------------------------------------------------------------

  const handleTitlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    handleFocus();
    setDragging(true);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const windowEl = windowRef.current;

    if (maximized) {
      // Unmaximize on drag: restore window centered on cursor
      const restored = preSnapRef.current ?? { x: 100, y: 100, width: 800, height: 600 };
      setMaximized(false);
      setSnapZone(null);
      setSize({ width: restored.width, height: restored.height });
      const newX = e.clientX - restored.width / 2;
      const newY = e.clientY - 18;
      setPos({ x: newX, y: newY });
      dragOffsetRef.current = { x: restored.width / 2, y: 18 };
      preSnapRef.current = null;
    } else {
      dragOffsetRef.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    }

    // Smooth drag - RAF reads latest position without cancellation
    // This prevents 120Hz pointermove from cancelling 60Hz RAF frames
    const latestPos = { x: posRef.current.x, y: posRef.current.y };
    let rafScheduled = false;

    const onMove = (ev: PointerEvent) => {
      const unclampedX = ev.clientX - dragOffsetRef.current.x;
      const unclampedY = ev.clientY - dragOffsetRef.current.y;
      const clamped = clampWindowPosition(unclampedX, unclampedY, sizeRef.current.width, sizeRef.current.height);
      latestPos.x = clamped.x;
      latestPos.y = clamped.y;
      
      // Schedule RAF only once - it will read latest position when it fires
      if (!rafScheduled) {
        rafScheduled = true;
        dragRafRef.current = requestAnimationFrame(() => {
          rafScheduled = false;
          if (windowEl) {
            windowEl.style.left = `${latestPos.x}px`;
            windowEl.style.top = `${latestPos.y}px`;
          }
        });
      }

      // Throttled snap zone preview (every SNAP_DETECT_THROTTLE_MS)
      const now = performance.now();
      if (now - lastSnapCheckRef.current >= SNAP_DETECT_THROTTLE_MS) {
        lastSnapCheckRef.current = now;
        const zone = detectSnapZone(ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
        if (previewZoneRef.current !== zone) {
          previewZoneRef.current = zone;
          setPreviewZone(zone);
        }
      }

      // Shake detection - simplified
      shakeHistoryRef.current.push({ x: ev.clientX, ts: now });
      if (shakeHistoryRef.current.length > 10) shakeHistoryRef.current = shakeHistoryRef.current.slice(-10);
      let reversals = 0;
      for (let i = 2; i < shakeHistoryRef.current.length; i++) {
        const d1 = shakeHistoryRef.current[i - 1].x - shakeHistoryRef.current[i - 2].x;
        const d2 = shakeHistoryRef.current[i].x - shakeHistoryRef.current[i - 1].x;
        if (Math.sign(d1) !== Math.sign(d2) && Math.abs(d2) > 30) reversals++;
      }
      if (reversals >= 3) {
        window.dispatchEvent(new CustomEvent('dex-window-shake', { detail: { windowId: id } }));
        shakeHistoryRef.current = [];
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (el.hasPointerCapture(ev.pointerId)) {
        el.releasePointerCapture(ev.pointerId);
      }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onLostCapture);
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      setDragging(false);

      const unclampedX = ev.clientX - dragOffsetRef.current.x;
      const unclampedY = ev.clientY - dragOffsetRef.current.y;
      const clamped = clampWindowPosition(unclampedX, unclampedY, sizeRef.current.width, sizeRef.current.height);
      const finalX = clamped.x;
      const finalY = clamped.y;
      const zone = detectSnapZone(ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
      previewZoneRef.current = null;
      setPreviewZone(null);

      if (zone) {
        if (!preSnapRef.current) {
          preSnapRef.current = { x: posRef.current.x, y: posRef.current.y, width: sizeRef.current.width, height: sizeRef.current.height };
        }
        const bounds = getSnapBounds(zone);
        setPos({ x: bounds.x, y: bounds.y });
        setSize({ width: bounds.width, height: bounds.height });
        setSnapZone(zone);
        if (zone === 'full') setMaximized(true);
      } else {
        // Commit live position
        setPos({ x: finalX, y: finalY });
        if (snapZone) {
          if (preSnapRef.current) {
            setSize({ width: preSnapRef.current.width, height: preSnapRef.current.height });
            preSnapRef.current = null;
          }
          setSnapZone(null);
        }
      }

      flushPersist();
    };

    const onLostCapture = () => {
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onLostCapture);
      setDragging(false);
      const clamped = clampWindowPosition(latestPos.x, latestPos.y, sizeRef.current.width, sizeRef.current.height);
      setPos(clamped);
      previewZoneRef.current = null;
      setPreviewZone(null);
      flushPersist();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onLostCapture);
  }, [flushPersist, handleFocus, id, maximized, snapZone]);

  // -----------------------------------------------------------------------
  // EDGE RESIZING
  // -----------------------------------------------------------------------

  const handleResizePointerDown = useCallback((dir: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFocus();
    setResizing(true);
    resizeDirRef.current = dir;
    resizeStartRef.current = { x: posRef.current.x, y: posRef.current.y, w: sizeRef.current.width, h: sizeRef.current.height, px: e.clientX, py: e.clientY };

    const onMove = (ev: PointerEvent) => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        const dx = ev.clientX - resizeStartRef.current.px;
        const dy = ev.clientY - resizeStartRef.current.py;
        const d = resizeDirRef.current;
        let nx = resizeStartRef.current.x;
        let ny = resizeStartRef.current.y;
        let nw = resizeStartRef.current.w;
        let nh = resizeStartRef.current.h;

        if (d.includes('e')) nw = Math.max(minWidth, nw + dx);
        if (d.includes('w')) { nw = Math.max(minWidth, nw - dx); nx = nx + (resizeStartRef.current.w - nw); }
        if (d.includes('s')) nh = Math.max(minHeight, nh + dy);
        if (d.includes('n')) { nh = Math.max(minHeight, nh - dy); ny = ny + (resizeStartRef.current.h - nh); }

        setPos({ x: nx, y: ny });
        setSize({ width: nw, height: nh });

        // Size tooltip
        if (sizeTooltipTimerRef.current) clearTimeout(sizeTooltipTimerRef.current);
        setSizeTooltip({ x: ev.clientX + 16, y: ev.clientY + 16, w: Math.round(nw), h: Math.round(nh) });
      });
    };

    const detach = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };

    const onUp = () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      detach();
      resizeCleanupRef.current = null;
      setResizing(false);
      sizeTooltipTimerRef.current = setTimeout(() => setSizeTooltip(null), 500);
      flushPersist();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    resizeCleanupRef.current = detach;
  }, [flushPersist, handleFocus, minWidth, minHeight]);

  // -----------------------------------------------------------------------
  // WINDOW CONTROLS
  // -----------------------------------------------------------------------

  const handleCloseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(id);
  }, [id, onClose]);

  const handleMinimizeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimized(true);
    onMinimize(id);
  }, [id, onMinimize]);

  const handleMaximizeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (maximized) {
      if (preSnapRef.current) {
        setPos({ x: preSnapRef.current.x, y: preSnapRef.current.y });
        setSize({ width: preSnapRef.current.width, height: preSnapRef.current.height });
        preSnapRef.current = null;
      }
      setMaximized(false);
      setSnapZone(null);
    } else {
      preSnapRef.current = { x: posRef.current.x, y: posRef.current.y, width: sizeRef.current.width, height: sizeRef.current.height };
      const m = getMaximizedBounds();
      setPos({ x: m.x, y: m.y });
      setSize({ width: m.width, height: m.height });
      setMaximized(true);
      setSnapZone('full');
    }
    onMaximize(id);
  }, [id, maximized, onMaximize]);

  // Edge hover glow
  const handleEdgeHover = useCallback((edge: string | null) => {
    setEdgeGlow(edge);
  }, []);

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  if (minimized) return null;

  const isActive = active;
  const shadowLevel = isActive
    ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px var(--color-border-subtle), 0 0 12px rgba(74,158,255,0.06)'
    : '0 4px 16px rgba(0,0,0,0.35), 0 0 0 0.5px var(--color-bg-hover)';

  const maxBounds = maximized ? getMaximizedBounds() : null;
  const actualX = maxBounds ? maxBounds.x : pos.x;
  const actualY = maxBounds ? maxBounds.y : pos.y;
  const actualW = maxBounds ? maxBounds.width : size.width;
  const actualH = maxBounds ? maxBounds.height : size.height;

  const HANDLE = 6;
  const cursorMap: Record<string, string> = {
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
  };
  const edges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  const edgeStyle = (dir: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute', zIndex: 1,
      cursor: cursorMap[dir],
    };
    if (dir === 'n') return { ...base, top: -HANDLE / 2, left: HANDLE, right: HANDLE, height: HANDLE };
    if (dir === 's') return { ...base, bottom: -HANDLE / 2, left: HANDLE, right: HANDLE, height: HANDLE };
    if (dir === 'e') return { ...base, right: -HANDLE / 2, top: HANDLE, bottom: HANDLE, width: HANDLE };
    if (dir === 'w') return { ...base, left: -HANDLE / 2, top: HANDLE, bottom: HANDLE, width: HANDLE };
    if (dir === 'ne') return { ...base, top: -HANDLE / 2, right: -HANDLE / 2, width: HANDLE * 2, height: HANDLE * 2 };
    if (dir === 'nw') return { ...base, top: -HANDLE / 2, left: -HANDLE / 2, width: HANDLE * 2, height: HANDLE * 2 };
    if (dir === 'se') return { ...base, bottom: -HANDLE / 2, right: -HANDLE / 2, width: HANDLE * 2, height: HANDLE * 2 };
    if (dir === 'sw') return { ...base, bottom: -HANDLE / 2, left: -HANDLE / 2, width: HANDLE * 2, height: HANDLE * 2 };
    return base;
  };

  return (
    <>
      <SnapPreview zone={previewZone} />
      <div
        ref={windowRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`window-title-${id}`}
        data-floating-window={id}
        data-dragging={dragging ? 'true' : undefined}
        data-resizing={resizing ? 'true' : undefined}
        onPointerDown={handleFocus}
        style={{
          position: 'fixed',
          left: actualX,
          top: actualY,
          width: actualW,
          height: actualH,
          zIndex,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: maximized ? 0 : 10,
          // Allow dropdown menus to escape window bounds (macOS style)
          overflow: 'visible',
          // Use clip-path for visual corner rounding without clipping menus
          clipPath: maximized ? 'none' : 'inset(0 round 10px)',
          boxShadow: dragging ? '0 20px 50px rgba(0,0,0,0.4)' : shadowLevel,
          opacity: isActive ? 1 : 0.94,
          contain: 'layout style',
          willChange: 'auto',
          transition: 'none',
          // webkit-app-region handled by CSS on [data-floating-window]
        }}
      >
        {/* Resize handles */}
        {!maximized && edges.map(dir => (
          <div
            key={dir}
            style={edgeStyle(dir)}
            onPointerDown={(e) => handleResizePointerDown(dir, e)}
            onPointerEnter={() => handleEdgeHover(dir)}
            onPointerLeave={() => handleEdgeHover(null)}
          />
        ))}

        {/* Edge glow */}
        {edgeGlow && !maximized && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none',
            border: '1px solid var(--color-accent)',
            opacity: 0.4,
            zIndex: 2,
            transition: 'opacity 0.1s ease',
          }} />
        )}

        {/* Title bar -- premium glass */}
        <div
          onPointerDown={handleTitlePointerDown}
          onDoubleClick={handleMaximizeClick}
          style={{
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isActive ? 'var(--pg-toolbar)' : 'var(--pg-surface)',
            backdropFilter: 'var(--blur-lg) saturate(170%)',
            WebkitBackdropFilter: 'var(--blur-lg) saturate(170%)',
            borderBottom: '1px solid var(--pg-border)',
            boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
            flexShrink: 0,
            position: 'relative',
            cursor: 'grab',
            userSelect: 'none',
            touchAction: 'none',
            // webkit-app-region inherited from parent [data-floating-window]
          }}
        >
          {/* Window controls — macOS left, Windows/Linux right */}
          {platform.isMac ? (
            <div style={{ position: 'absolute', left: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <TrafficButton color="#FF5F57" hoverMark="close" onClick={handleCloseClick} ariaLabel="Close window" />
              <TrafficButton color="#FEBC2E" hoverMark="minimize" onClick={handleMinimizeClick} ariaLabel="Minimize window" />
              <TrafficButton color="#28C840" hoverMark="maximize" onClick={handleMaximizeClick} ariaLabel="Maximize window" />
            </div>
          ) : (
            <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'stretch' }}>
              <WinButton action="minimize" onClick={handleMinimizeClick} ariaLabel="Minimize window" />
              <WinButton action="maximize" onClick={handleMaximizeClick} ariaLabel="Maximize window" />
              <WinButton action="close" onClick={handleCloseClick} ariaLabel="Close window" />
            </div>
          )}

          {/* Title — centered on macOS, left-aligned on Windows (matches OS conventions) */}
          <span
            id={`window-title-${id}`}
            style={{
            fontSize: 12,
            color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            pointerEvents: 'none',
            ...(platform.isMac ? {} : {
              position: 'absolute',
              left: 12,
            }),
          }}>
            {title}
          </span>
        </div>

        {/* Content - menus use portals or high z-index to escape */}
        <div style={{ 
          flex: 1, 
          position: 'relative', 
          overflow: 'hidden', 
          background: 'var(--color-bg-base)',
          // Isolation context for proper z-index stacking of app menus
          isolation: 'isolate',
        }}>
          {children}
        </div>
      </div>

      {/* Size tooltip during resize */}
      {sizeTooltip && (
        <div style={{
          position: 'fixed',
          left: sizeTooltip.x,
          top: sizeTooltip.y,
          padding: '4px 8px',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.80)',
          color: 'var(--color-text-primary)',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          pointerEvents: 'none',
          zIndex: 'var(--z-modal)',
          whiteSpace: 'nowrap',
        }}>
          {sizeTooltip.w} x {sizeTooltip.h}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// WINDOWS SYSTEM BUTTON
// ---------------------------------------------------------------------------

const WinButton: React.FC<{
  action: 'close' | 'minimize' | 'maximize';
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
}> = ({ action, ariaLabel, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const icon = (() => {
    switch (action) {
      case 'close':
        return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>;
      case 'minimize':
        return <svg width="10" height="2" viewBox="0 0 10 2" fill="none"><line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" strokeWidth="1.2"/></svg>;
      case 'maximize':
        return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1"><rect x="0.5" y="0.5" width="9" height="9" rx="0"/></svg>;
    }
  })();

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={ariaLabel}
      style={{
        width: 46,
        height: '100%',
        border: 'none',
        background: hovered
          ? action === 'close' ? '#C42B1C' : 'rgba(255,255,255,0.08)'
          : 'transparent',
        color: hovered && action === 'close' ? '#fff' : 'var(--color-text-muted)',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.1s, color 0.1s',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {icon}
    </button>
  );
};

// ---------------------------------------------------------------------------
// TRAFFIC LIGHT BUTTON
// ---------------------------------------------------------------------------

const TrafficButton: React.FC<{
  color: string;
  hoverMark: 'close' | 'minimize' | 'maximize';
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
}> = ({ color, hoverMark, ariaLabel, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const markSvg = (() => {
    switch (hoverMark) {
      case 'close':
        return <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2"><line x1="0.5" y1="0.5" x2="5.5" y2="5.5"/><line x1="5.5" y1="0.5" x2="0.5" y2="5.5"/></svg>;
      case 'minimize':
        return <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2"><line x1="0.5" y1="3" x2="5.5" y2="3"/></svg>;
      case 'maximize':
        return <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2"><polyline points="1,4 3,1.5 5,4"/></svg>;
    }
  })();

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={ariaLabel}
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'opacity 0.1s ease',
        opacity: 0.85,
      }}
    >
      {hovered && markSvg}
    </button>
  );
};
