// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Drag and Drop Polish
 * Provides hooks for drag initiation delay, lift animation,
 * drop zone feedback, count badges, and multi-select stacking.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { isReduceMotion } from '../utils/MotionController';
import { playDrop, playError } from './SpatialAudio';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface DragState {
  dragging: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  count: number;
}

export interface DropZoneState {
  active: boolean;
  valid: boolean;
}

// ---------------------------------------------------------------------------
// useDragItem — hook for making elements draggable with polish
// ---------------------------------------------------------------------------

export function useDragItem<T>(options: {
  /** Data payload */
  data: T;
  /** Number of items being dragged (for badge) */
  count?: number;
  /** Delay in ms before drag initiates (default 200) */
  delay?: number;
  /** Callback when drag starts */
  onDragStart?: () => void;
  /** Callback when drag ends */
  onDragEnd?: (dropped: boolean) => void;
}) {
  const { data, count = 1, delay = 200, onDragStart, onDragEnd } = options;
  const [dragState, setDragState] = useState<DragState>({ dragging: false, x: 0, y: 0, startX: 0, startY: 0, count });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const mountedRef = useRef(true);
  dataRef.current = data;

  // Cleanup on unmount: clear timer and global drag state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      delete (window as any).__dexDragData;
      delete (window as any).__dexDragCount;
      delete (window as any).__dexDropReceived;
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return; // Guard against unmount
      setDragState({ dragging: true, x: startX, y: startY, startX, startY, count });
      onDragStart?.();
      // Store in a global for drop zones to read
      (window as any).__dexDragData = dataRef.current;
      (window as any).__dexDragCount = count;
    }, delay);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // Cancel if moved before delay threshold
      if (!dragState.dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      }
      setDragState(prev => prev.dragging ? { ...prev, x: ev.clientX, y: ev.clientY } : prev);
    };

    const onUp = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setDragState(prev => {
        if (prev.dragging) {
          const dropped = !!(window as any).__dexDropReceived;
          onDragEnd?.(dropped);
          delete (window as any).__dexDragData;
          delete (window as any).__dexDragCount;
          delete (window as any).__dexDropReceived;
        }
        return { dragging: false, x: 0, y: 0, startX: 0, startY: 0, count };
      });
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [count, delay, onDragStart, onDragEnd, dragState.dragging]);

  return { dragState, onPointerDown };
}

// ---------------------------------------------------------------------------
// useDropZone — hook for drop target feedback
// ---------------------------------------------------------------------------

export function useDropZone<T>(options: {
  /** Validate if dropped data is acceptable */
  accept: (data: T) => boolean;
  /** Called on successful drop */
  onDrop: (data: T) => void;
}) {
  const { accept, onDrop } = options;
  const [dropState, setDropState] = useState<DropZoneState>({ active: false, valid: false });

  const onPointerEnter = useCallback(() => {
    const data = (window as any).__dexDragData;
    if (data === undefined) return;
    const valid = accept(data);
    setDropState({ active: true, valid });
  }, [accept]);

  const onPointerLeave = useCallback(() => {
    setDropState({ active: false, valid: false });
  }, []);

  const onPointerUp = useCallback(() => {
    const data = (window as any).__dexDragData;
    if (data === undefined || !dropState.valid) {
      if (dropState.active) {
        playError(window.innerWidth / 2);
      }
      setDropState({ active: false, valid: false });
      return;
    }
    (window as any).__dexDropReceived = true;
    onDrop(data);
    playDrop(window.innerWidth / 2);
    setDropState({ active: false, valid: false });
  }, [accept, onDrop, dropState]);

  const dropZoneStyle: React.CSSProperties = dropState.active ? {
    background: dropState.valid ? 'var(--color-accent-soft, rgba(74,158,255,0.08))' : 'transparent',
    border: dropState.valid ? '2px solid var(--color-accent)' : '2px solid transparent',
    borderRadius: 6,
    transition: isReduceMotion() ? 'none' : 'background 0.08s ease, border-color 0.08s ease',
    cursor: dropState.valid ? 'copy' : 'not-allowed',
  } : {};

  return {
    dropState,
    dropZoneProps: {
      onPointerEnter,
      onPointerLeave,
      onPointerUp,
    },
    dropZoneStyle,
  };
}

// ---------------------------------------------------------------------------
// DragGhost — floating ghost element following cursor during drag
// ---------------------------------------------------------------------------

export const DragGhost: React.FC<{
  visible: boolean;
  x: number;
  y: number;
  count: number;
  children: React.ReactNode;
}> = ({ visible, x, y, count, children }) => {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      left: x - 20,
      top: y - 20,
      pointerEvents: 'none',
      zIndex: 'var(--z-max)',
      transform: 'scale(1.04)',
      opacity: 0.9,
      filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))',
    }}>
      {/* Stacked cards for multi-select */}
      {count > 1 && (
        <>
          {count >= 3 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'var(--color-border-subtle)',
              borderRadius: 6,
              transform: 'translate(8px, 8px) rotate(4deg)',
              border: '1px solid var(--color-bg-hover)',
            }} />
          )}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--color-border-subtle)',
            borderRadius: 6,
            transform: 'translate(4px, 4px) rotate(2deg)',
            border: '1px solid var(--color-bg-hover)',
          }} />
        </>
      )}

      {children}

      {/* Count badge */}
      {count > 1 && (
        <div style={{
          position: 'absolute',
          top: -8, right: -8,
          width: 20, height: 20,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {count}
        </div>
      )}
    </div>
  );
};
