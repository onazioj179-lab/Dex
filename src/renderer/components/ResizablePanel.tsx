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
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    return null;
  }, [storageKey]);

  const storedSize = useMemo(() => getStoredSize(), [getStoredSize]);

  const [size, setSize] = useState({
    width: storedSize?.width ?? initialWidth ?? 300,
    height: storedSize?.height ?? initialHeight ?? 200,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [activeDirection, setActiveDirection] = useState<ResizeDirection | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
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

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    startPos.current = { x: clientX, y: clientY };
    startSize.current = { ...size };
    setActiveDirection(direction);
    setIsResizing(true);
    onResizeStart?.();
  }, [size, onResizeStart]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing || !activeDirection) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startPos.current.x;
      const deltaY = clientY - startPos.current.y;

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

      setSize({ width: newWidth, height: newHeight });
      onResize?.(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setActiveDirection(null);
      saveSize(size.width, size.height);
      onResizeEnd?.(size.width, size.height);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove);
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isResizing, activeDirection, clamp, snap, minWidth, maxWidth, minHeight, maxHeight, onResize, onResizeEnd, saveSize, size.width, size.height]);

  // Double-click to reset
  const handleDoubleClick = useCallback(() => {
    const newWidth = defaultWidth ?? initialWidth ?? 300;
    const newHeight = defaultHeight ?? initialHeight ?? 200;
    setSize({ width: newWidth, height: newHeight });
    saveSize(newWidth, newHeight);
    onResizeEnd?.(newWidth, newHeight);
  }, [defaultWidth, defaultHeight, initialWidth, initialHeight, saveSize, onResizeEnd]);

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
        style={handleStyle}
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
