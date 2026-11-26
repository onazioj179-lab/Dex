// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ResizablePanel - Flexible panel with drag-to-resize
 * 
 * Features:
 * - Drag handles on any edge
 * - Min/max constraints
 * - Double-click to reset
 * - Size persistence in localStorage
 * - Snap-to-grid option
 * - Visual resize affordances
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { colors, radius } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface ResizablePanelProps {
  children: React.ReactNode;
  /** Initial width */
  initialWidth?: number;
  /** Initial height */
  initialHeight?: number;
  /** Minimum width */
  minWidth?: number;
  /** Minimum height */
  minHeight?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Maximum height */
  maxHeight?: number;
  /** Which edges can be resized */
  resizeDirections?: ResizeDirection[];
  /** Key for localStorage persistence */
  storageKey?: string;
  /** Snap to grid size (pixels) */
  snapToGrid?: number;
  /** Called when resize starts */
  onResizeStart?: () => void;
  /** Called during resize */
  onResize?: (width: number, height: number) => void;
  /** Called when resize ends */
  onResizeEnd?: (width: number, height: number) => void;
  /** Default width for reset */
  defaultWidth?: number;
  /** Default height for reset */
  defaultHeight?: number;
  /** Custom class name */
  className?: string;
  /** Custom styles */
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 6;
const HANDLE_HITAREA = 12;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  children,
  initialWidth,
  initialHeight,
  minWidth = 100,
  minHeight = 100,
  maxWidth = Infinity,
  maxHeight = Infinity,
  resizeDirections = ['e', 's', 'se'],
  storageKey,
  snapToGrid,
  onResizeStart,
  onResize,
  onResizeEnd,
  defaultWidth,
  defaultHeight,
  className,
  style,
}) => {
  // Load initial size from storage
  const getStoredSize = useCallback(() => {
    if (!storageKey) return null;
    try {
      const stored = localStorage.getItem(`dex-resize-${storageKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Number.isFinite(parsed?.width) && Number.isFinite(parsed?.height)) return parsed;
      }
    } catch {
      // Ignore
    }
    return null;
  }, [storageKey]);

  const storedSize = useMemo(() => getStoredSize(), [getStoredSize]);

  const [size, setSize] = useState({
    width: Math.max(minWidth, Math.min(maxWidth, storedSize?.width ?? initialWidth ?? 300)),
    height: Math.max(minHeight, Math.min(maxHeight, storedSize?.height ?? initialHeight ?? 200)),
  });

  const [isResizing, setIsResizing] = useState(false);
  const [activeDirection, setActiveDirection] = useState<ResizeDirection | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const viewScale = useRef({ x: 1, y: 1 });
  const resizeCallbacks = useRef({ onResize, onResizeEnd });
  resizeCallbacks.current = { onResize, onResizeEnd };
  const startSize = useRef({ width: 0, height: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Save to storage
  const saveSize = useCallback((width: number, height: number) => {
    if (storageKey) {
      try {
        localStorage.setItem(`dex-resize-${storageKey}`, JSON.stringify({ width, height }));
      } catch {
        // Ignore
      }
    }
  }, [storageKey]);

  // Snap value to grid
  const snap = useCallback((value: number): number => {
    if (!snapToGrid) return value;
    return Math.round(value / snapToGrid) * snapToGrid;
  }, [snapToGrid]);

  // Clamp value within bounds
  const clamp = useCallback((value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
  }, []);

  // Handle resize start
  const handleResizeStart = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    direction: ResizeDirection
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if ('touches' in e && !e.touches.length) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const panel = panelRef.current;
    const rect = panel?.getBoundingClientRect();
    viewScale.current = {
      x: panel?.offsetWidth && rect?.width ? rect.width / panel.offsetWidth : 1,
      y: panel?.offsetHeight && rect?.height ? rect.height / panel.offsetHeight : 1,
    };
    startPos.current = { x: clientX, y: clientY };
    startSize.current = { ...size };
    setActiveDirection(direction);
    setIsResizing(true);
    onResizeStart?.();
  }, [size, onResizeStart]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing || !activeDirection) return;

    let rafId = 0;
    let pendingW = startSize.current.width;
    let pendingH = startSize.current.height;
    const flush = () => { rafId = 0; setSize({ width: pendingW, height: pendingH }); resizeCallbacks.current.onResize?.(pendingW, pendingH); };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && !e.touches.length) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = (clientX - startPos.current.x) / viewScale.current.x;
      const deltaY = (clientY - startPos.current.y) / viewScale.current.y;

      let newWidth = startSize.current.width;
      let newHeight = startSize.current.height;

      // Calculate new size based on direction
      if (activeDirection.includes('e')) {
        newWidth = startSize.current.width + deltaX;
      }
      if (activeDirection.includes('w')) {
        newWidth = startSize.current.width - deltaX;
      }
      if (activeDirection.includes('s')) {
        newHeight = startSize.current.height + deltaY;
      }
      if (activeDirection.includes('n')) {
        newHeight = startSize.current.height - deltaY;
      }

      // Snap and clamp
      newWidth = clamp(snap(newWidth), minWidth, maxWidth);
      newHeight = clamp(snap(newHeight), minHeight, maxHeight);

      // Coalesce to one setSize/onResize per frame instead of per mousemove.
      pendingW = newWidth;
      pendingH = newHeight;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const handleMouseUp = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      // Commit the final dragged size directly — reading the `size` state here
      // would lag a frame behind the last batched update.
      setSize({ width: pendingW, height: pendingH });
      setIsResizing(false);
      setActiveDirection(null);
      saveSize(pendingW, pendingH);
      resizeCallbacks.current.onResizeEnd?.(pendingW, pendingH);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);
    document.addEventListener('touchcancel', handleMouseUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
      document.removeEventListener('touchcancel', handleMouseUp);
    };
  }, [isResizing, activeDirection, clamp, snap, minWidth, maxWidth, minHeight, maxHeight, saveSize]);

  // Double-click to reset
  const handleDoubleClick = useCallback(() => {
    const newWidth = clamp(defaultWidth ?? initialWidth ?? 300, minWidth, maxWidth);
    const newHeight = clamp(defaultHeight ?? initialHeight ?? 200, minHeight, maxHeight);
    setSize({ width: newWidth, height: newHeight });
    saveSize(newWidth, newHeight);
    onResize?.(newWidth, newHeight);
    onResizeEnd?.(newWidth, newHeight);
  }, [defaultWidth, defaultHeight, initialWidth, initialHeight, saveSize, onResize, onResizeEnd, clamp, minWidth, maxWidth, minHeight, maxHeight]);

  // Get cursor for direction
  const getCursor = (direction: ResizeDirection): string => {
    const cursors: Record<ResizeDirection, string> = {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
    };
    return cursors[direction];
  };

  // Render handle
  const renderHandle = (direction: ResizeDirection) => {
    if (!resizeDirections.includes(direction)) return null;

    const isCorner = direction.length === 2;
    const isHorizontal = direction === 'e' || direction === 'w';
    const isVertical = direction === 'n' || direction === 's';

    const handleStyle: React.CSSProperties = {
      position: 'absolute',
      background: isResizing && activeDirection === direction
        ? colors.accent.default
        : 'transparent',
      transition: 'background 0.1s ease',
      zIndex: 10,
    };

    // Position handles
    if (direction === 'n') {
      Object.assign(handleStyle, {
        top: -HANDLE_HITAREA / 2,
        left: HANDLE_HITAREA,
        right: HANDLE_HITAREA,
        height: HANDLE_HITAREA,
        cursor: getCursor(direction),
      });
    } else if (direction === 's') {
      Object.assign(handleStyle, {
        bottom: -HANDLE_HITAREA / 2,
        left: HANDLE_HITAREA,
        right: HANDLE_HITAREA,
        height: HANDLE_HITAREA,
        cursor: getCursor(direction),
      });
    } else if (direction === 'e') {
      Object.assign(handleStyle, {
        right: -HANDLE_HITAREA / 2,
        top: HANDLE_HITAREA,
        bottom: HANDLE_HITAREA,
        width: HANDLE_HITAREA,
        cursor: getCursor(direction),
      });
    } else if (direction === 'w') {
      Object.assign(handleStyle, {
        left: -HANDLE_HITAREA / 2,
        top: HANDLE_HITAREA,
        bottom: HANDLE_HITAREA,
        width: HANDLE_HITAREA,
        cursor: getCursor(direction),
      });
    } else if (direction === 'ne') {
      Object.assign(handleStyle, {
        top: -HANDLE_HITAREA / 2,
        right: -HANDLE_HITAREA / 2,
        width: HANDLE_HITAREA * 2,
        height: HANDLE_HITAREA * 2,
        cursor: getCursor(direction),
      });
    } else if (direction === 'nw') {
      Object.assign(handleStyle, {
        top: -HANDLE_HITAREA / 2,
        left: -HANDLE_HITAREA / 2,
        width: HANDLE_HITAREA * 2,
        height: HANDLE_HITAREA * 2,
        cursor: getCursor(direction),
      });
    } else if (direction === 'se') {
      Object.assign(handleStyle, {
        bottom: -HANDLE_HITAREA / 2,
        right: -HANDLE_HITAREA / 2,
        width: HANDLE_HITAREA * 2,
        height: HANDLE_HITAREA * 2,
        cursor: getCursor(direction),
      });
    } else if (direction === 'sw') {
      Object.assign(handleStyle, {
        bottom: -HANDLE_HITAREA / 2,
        left: -HANDLE_HITAREA / 2,
        width: HANDLE_HITAREA * 2,
        height: HANDLE_HITAREA * 2,
        cursor: getCursor(direction),
      });
    }

    return (
      <div
        key={direction}
        role={isCorner ? 'button' : 'separator'}
        tabIndex={0}
        aria-label={'Resize panel ' + direction}
        aria-orientation={isCorner ? undefined : isHorizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={isCorner ? undefined : isHorizontal ? size.width : size.height}
        aria-valuemin={isCorner ? undefined : isHorizontal ? minWidth : minHeight}
        aria-valuemax={isCorner ? undefined : Number.isFinite(isHorizontal ? maxWidth : maxHeight) ? (isHorizontal ? maxWidth : maxHeight) : undefined}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); event.stopPropagation();
            handleDoubleClick();
            return;
          }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          const horizontalKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
          if (!isCorner && horizontalKey !== isHorizontal) return;
          event.preventDefault(); event.stopPropagation();
          const step = event.shiftKey ? 50 : 10;
          const sign = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          const edgeSign = horizontalKey ? (direction.includes('w') ? -1 : 1) : (direction.includes('n') ? -1 : 1);
          const width = horizontalKey ? clamp(snap(size.width + sign * step * edgeSign), minWidth, maxWidth) : size.width;
          const height = horizontalKey ? size.height : clamp(snap(size.height + sign * step * edgeSign), minHeight, maxHeight);
          setSize({ width, height }); saveSize(width, height);
          resizeCallbacks.current.onResize?.(width, height);
          resizeCallbacks.current.onResizeEnd?.(width, height);
        }}
        style={{ ...handleStyle, touchAction: 'none' }}
        onMouseDown={(e) => handleResizeStart(e, direction)}
        onTouchStart={(e) => handleResizeStart(e, direction)}
        onDoubleClick={handleDoubleClick}
      >
        {/* Visual indicator for corner handles */}
        {isCorner && (
          <div
            style={{
              position: 'absolute',
              bottom: direction.includes('s') ? 2 : 'auto',
              top: direction.includes('n') ? 2 : 'auto',
              right: direction.includes('e') ? 2 : 'auto',
              left: direction.includes('w') ? 2 : 'auto',
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              borderRadius: 2,
              background: colors.text.tertiary,
              opacity: isResizing && activeDirection === direction ? 1 : 0.5,
              transition: 'opacity 0.1s ease',
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      className={className}
      style={{
        position: 'relative',
        width: size.width,
        height: size.height,
        ...style,
      }}
    >
      {children}

      {/* Resize handles */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map(renderHandle)}

      {/* Resize overlay (prevents content interaction during resize) */}
      {isResizing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            cursor: activeDirection ? getCursor(activeDirection) : 'default',
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hook for programmatic resize control
// ---------------------------------------------------------------------------

export const useResizablePanel = (storageKey?: string) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(`dex-resize-${storageKey}`);
      if (stored) {
        setSize(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }
  }, [storageKey]);

  const updateSize = useCallback((width: number, height: number) => {
    setSize({ width, height });
    if (storageKey) {
      localStorage.setItem(`dex-resize-${storageKey}`, JSON.stringify({ width, height }));
    }
  }, [storageKey]);

  const resetSize = useCallback(() => {
    if (storageKey) {
      localStorage.removeItem(`dex-resize-${storageKey}`);
    }
    setSize({ width: 0, height: 0 });
  }, [storageKey]);

  return { size, updateSize, resetSize };
};

export default ResizablePanel;
