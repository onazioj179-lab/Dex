// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * SmoothZoom - Smooth zoom and pan controls for creative apps
 * 
 * Features:
 * - Pinch-to-zoom with momentum
 * - Mouse wheel zoom at cursor position
 * - Pan with middle mouse or space+drag
 * - Fit to screen / actual size shortcuts
 * - Zoom level indicator
 * - Reduce motion compliance
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { colors, radius } from '../styles/tokens';
import { isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface ZoomBounds {
  minScale: number;
  maxScale: number;
}

export interface SmoothZoomContextValue {
  transform: Transform;
  setTransform: (transform: Transform | ((prev: Transform) => Transform)) => void;
  zoomTo: (scale: number, center?: { x: number; y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  resetZoom: () => void;
  panBy: (dx: number, dy: number) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SmoothZoomContext = createContext<SmoothZoomContextValue | null>(null);

export const useSmoothZoom = () => {
  const context = useContext(SmoothZoomContext);
  if (!context) {
    throw new Error('useSmoothZoom must be used within SmoothZoomProvider');
  }
  return context;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SmoothZoomProviderProps {
  children: React.ReactNode;
  /** Initial transform */
  initialTransform?: Transform;
  /** Zoom limits */
  bounds?: ZoomBounds;
  /** Callback when transform changes */
  onTransformChange?: (transform: Transform) => void;
}

export const SmoothZoomProvider: React.FC<SmoothZoomProviderProps> = ({
  children,
  initialTransform = { x: 0, y: 0, scale: 1 },
  bounds = { minScale: 0.1, maxScale: 10 },
  onTransformChange,
}) => {
  const [transform, setTransformState] = useState<Transform>(initialTransform);
  const animationRef = useRef<number>();

  const setTransform = useCallback((
    update: Transform | ((prev: Transform) => Transform)
  ) => {
    setTransformState(prev => {
      const newTransform = typeof update === 'function' ? update(prev) : update;
      
      // Clamp scale
      const clampedScale = Math.max(
        bounds.minScale,
        Math.min(bounds.maxScale, newTransform.scale)
      );
      
      const result = { ...newTransform, scale: clampedScale };
      onTransformChange?.(result);
      return result;
    });
  }, [bounds, onTransformChange]);

  const zoomTo = useCallback((
    targetScale: number,
    center?: { x: number; y: number }
  ) => {
    const clampedScale = Math.max(
      bounds.minScale,
      Math.min(bounds.maxScale, targetScale)
    );

    if (isReduceMotion()) {
      setTransform(prev => {
        if (center) {
          // Zoom towards center point
          const scaleDelta = clampedScale / prev.scale;
          return {
            x: center.x - (center.x - prev.x) * scaleDelta,
            y: center.y - (center.y - prev.y) * scaleDelta,
            scale: clampedScale,
          };
        }
        return { ...prev, scale: clampedScale };
      });
      return;
    }

    // Animated zoom
    const startTime = performance.now();
    const duration = 200;
    const startScale = transform.scale;
    const startX = transform.x;
    const startY = transform.y;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const currentScale = startScale + (clampedScale - startScale) * eased;
      
      let x = startX;
      let y = startY;
      
      if (center) {
        const scaleDelta = currentScale / startScale;
        x = center.x - (center.x - startX) * scaleDelta;
        y = center.y - (center.y - startY) * scaleDelta;
      }
      
      setTransformState({ x, y, scale: currentScale });
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        onTransformChange?.({ x, y, scale: clampedScale });
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animate);
  }, [transform, bounds, setTransform, onTransformChange]);

  const zoomIn = useCallback(() => {
    zoomTo(transform.scale * 1.25);
  }, [transform.scale, zoomTo]);

  const zoomOut = useCallback(() => {
    zoomTo(transform.scale / 1.25);
  }, [transform.scale, zoomTo]);

  const fitToScreen = useCallback(() => {
    // This would need container dimensions - reset to 1 for now
    zoomTo(1);
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [zoomTo, setTransform]);

  const resetZoom = useCallback(() => {
    zoomTo(1);
    setTransform(prev => ({ ...prev, x: 0, y: 0 }));
  }, [zoomTo, setTransform]);

  const panBy = useCallback((dx: number, dy: number) => {
    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, [setTransform]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <SmoothZoomContext.Provider
      value={{
        transform,
        setTransform,
        zoomTo,
        zoomIn,
        zoomOut,
        fitToScreen,
        resetZoom,
        panBy,
      }}
    >
      {children}
    </SmoothZoomContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Zoom Container
// ---------------------------------------------------------------------------

export interface ZoomContainerProps {
  children: React.ReactNode;
  /** Class for container */
  className?: string;
  /** Style for container */
  style?: React.CSSProperties;
  /** Enable wheel zoom */
  enableWheel?: boolean;
  /** Enable pan with middle mouse */
  enableMiddleMousePan?: boolean;
  /** Enable touch gestures */
  enableTouch?: boolean;
  /** Background color/pattern */
  background?: string;
}

export const ZoomContainer: React.FC<ZoomContainerProps> = ({
  children,
  className,
  style,
  enableWheel = true,
  enableMiddleMousePan = true,
  enableTouch = true,
  background = 'transparent',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { transform, setTransform, zoomTo, panBy } = useSmoothZoom();
  const [isPanning, setIsPanning] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);

  // Wheel zoom
  useEffect(() => {
    if (!enableWheel || !containerRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        const rect = containerRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const delta = -e.deltaY * 0.001;
        const newScale = transform.scale * (1 + delta);
        
        zoomTo(newScale, { x, y });
      }
    };

    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [enableWheel, transform.scale, zoomTo]);

  // Middle mouse pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (enableMiddleMousePan && e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      lastPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      panBy(dx, dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, panBy]);

  // Touch gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableTouch) return;

    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistance.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartScale.current = transform.scale;
    } else if (e.touches.length === 1) {
      // Pan start
      lastPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enableTouch) return;

    if (e.touches.length === 2) {
      // Pinch
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scale = pinchStartScale.current * (distance / pinchStartDistance.current);
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = containerRef.current!.getBoundingClientRect();
      
      zoomTo(scale, {
        x: centerX - rect.left,
        y: centerY - rect.top,
      });
    } else if (e.touches.length === 1) {
      // Pan
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      panBy(dx, dy);
      lastPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background,
        cursor: isPanning ? 'grabbing' : 'default',
        touchAction: enableTouch ? 'none' : 'auto',
        ...style,
      }}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Zoom Controls UI
// ---------------------------------------------------------------------------

export interface ZoomControlsProps {
  /** Position of controls */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Show fit button */
  showFit?: boolean;
  /** Show reset button */
  showReset?: boolean;
  /** Show percentage */
  showPercentage?: boolean;
  /** Compact mode */
  compact?: boolean;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  position = 'bottom-right',
  showFit = true,
  showReset = true,
  showPercentage = true,
  compact = false,
}) => {
  const { transform, zoomIn, zoomOut, fitToScreen, resetZoom } = useSmoothZoom();

  const positionStyles: Record<string, React.CSSProperties> = {
    'top-left': { top: 12, left: 12 },
    'top-right': { top: 12, right: 12 },
    'bottom-left': { bottom: 12, left: 12 },
    'bottom-right': { bottom: 12, right: 12 },
  };

  const buttonStyle: React.CSSProperties = {
    width: compact ? 28 : 32,
    height: compact ? 28 : 32,
    padding: 0,
    background: colors.bg.surface,
    border: `1px solid ${colors.border.subtle}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.text.secondary,
    fontSize: compact ? 14 : 16,
    transition: 'background 0.1s ease, color 0.1s ease',
  };

  const percentage = Math.round(transform.scale * 100);

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyles[position],
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: colors.bg.elevated,
        padding: 4,
        borderRadius: radius.md,
        border: `1px solid ${colors.border.default}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <button onClick={zoomOut} style={buttonStyle} title="Zoom out (Ctrl -)">
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <path d="M3 7h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>

      {showPercentage && (
        <span
          style={{
            minWidth: compact ? 40 : 48,
            fontSize: compact ? 11 : 12,
            fontFamily: 'var(--font-mono)',
            color: colors.text.primary,
            textAlign: 'center',
          }}
        >
          {percentage}%
        </span>
      )}

      <button onClick={zoomIn} style={buttonStyle} title="Zoom in (Ctrl +)">
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
          <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </button>

      {showFit && (
        <button onClick={fitToScreen} style={buttonStyle} title="Fit to screen (Ctrl 0)">
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <rect x={2} y={2} width={10} height={10} rx={1} stroke="currentColor" strokeWidth={1.2} />
            <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
          </svg>
        </button>
      )}

      {showReset && (
        <button onClick={resetZoom} style={buttonStyle} title="Reset to 100% (Ctrl 1)">
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            <text x={7} y={10} fontSize={9} fill="currentColor" textAnchor="middle" fontWeight="bold">1:1</text>
          </svg>
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hook for keyboard shortcuts
// ---------------------------------------------------------------------------

export const useZoomKeyboard = () => {
  const { zoomIn, zoomOut, fitToScreen, resetZoom } = useSmoothZoom();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '=':
          case '+':
            e.preventDefault();
            zoomIn();
            break;
          case '-':
            e.preventDefault();
            zoomOut();
            break;
          case '0':
            e.preventDefault();
            fitToScreen();
            break;
          case '1':
            e.preventDefault();
            resetZoom();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, fitToScreen, resetZoom]);
};

export default SmoothZoomProvider;
