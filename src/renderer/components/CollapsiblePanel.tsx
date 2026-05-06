// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * CollapsiblePanel - Reusable sidebar/panel collapse component
 * 
 * Features:
 * - Spring animation using sidebarCollapse preset
 * - Double-click to reset width
 * - Scroll position memory
 * - aria-expanded accessibility
 * - Resize handle with visual affordance
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SPRING_PRESETS, isReduceMotion } from '../utils/MotionController';
import { radius, colors, zIndex } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CollapsiblePanelProps {
  /** Panel ID for scroll memory persistence */
  id: string;
  /** Whether panel is collapsed */
  collapsed: boolean;
  /** Toggle collapse callback */
  onToggle: () => void;
  /** Expanded width in pixels */
  width?: number;
  /** Collapsed width (0 = fully hidden) */
  collapsedWidth?: number;
  /** Minimum width when resizing */
  minWidth?: number;
  /** Maximum width when resizing */
  maxWidth?: number;
  /** Position of panel */
  position?: 'left' | 'right';
  /** Enable resize handle */
  resizable?: boolean;
  /** Callback when width changes from resize */
  onWidthChange?: (width: number) => void;
  /** Children content */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
  /** Header content (toggle button area) */
  header?: React.ReactNode;
  /** Show border on expanded side */
  showBorder?: boolean;
}

// ---------------------------------------------------------------------------
// Scroll Memory (localStorage)
// ---------------------------------------------------------------------------

const SCROLL_MEMORY_KEY = 'dex-panel-scroll-memory';

function getScrollMemory(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SCROLL_MEMORY_KEY) || '{}');
  } catch {
    return {};
  }
}

function setScrollMemory(id: string, scrollTop: number): void {
  try {
    const memory = getScrollMemory();
    memory[id] = scrollTop;
    localStorage.setItem(SCROLL_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Spring Animation Helper
// ---------------------------------------------------------------------------

function springInterpolate(
  from: number,
  to: number,
  config: { stiffness: number; damping: number; mass: number },
  onUpdate: (value: number) => void,
  onComplete?: () => void
): () => void {
  if (isReduceMotion()) {
    onUpdate(to);
    onComplete?.();
    return () => {};
  }

  let velocity = 0;
  let current = from;
  let animationId: number;
  const { stiffness, damping, mass } = config;

  const step = () => {
    const springForce = -stiffness * (current - to);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    
    velocity += acceleration * (1 / 60);
    current += velocity * (1 / 60);
    
    onUpdate(current);
    
    const isSettled = Math.abs(current - to) < 0.5 && Math.abs(velocity) < 0.5;
    if (isSettled) {
      onUpdate(to);
      onComplete?.();
    } else {
      animationId = requestAnimationFrame(step);
    }
  };

  animationId = requestAnimationFrame(step);
  return () => cancelAnimationFrame(animationId);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  id,
  collapsed,
  onToggle,
  width = 260,
  collapsedWidth = 0,
  minWidth = 180,
  maxWidth = 400,
  position = 'left',
  resizable = false,
  onWidthChange,
  children,
  className = '',
  style = {},
  header,
  showBorder = true,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentWidth, setCurrentWidth] = useState(collapsed ? collapsedWidth : width);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState(width);
  const lastClickRef = useRef<number>(0);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  // Animate width on collapse change
  useEffect(() => {
    cancelAnimRef.current?.();
    const targetWidth = collapsed ? collapsedWidth : resizeWidth;
    
    cancelAnimRef.current = springInterpolate(
      currentWidth,
      targetWidth,
      SPRING_PRESETS.sidebarCollapse,
      setCurrentWidth
    );

    return () => cancelAnimRef.current?.();
  }, [collapsed, collapsedWidth, resizeWidth]);

  // Restore scroll position on expand
  useEffect(() => {
    if (!collapsed && contentRef.current) {
      const memory = getScrollMemory();
      if (memory[id] !== undefined) {
        contentRef.current.scrollTop = memory[id];
      }
    }
  }, [collapsed, id]);

  // Save scroll position on collapse
  useEffect(() => {
    if (collapsed && contentRef.current) {
      setScrollMemory(id, contentRef.current.scrollTop);
    }
  }, [collapsed, id]);

  // Double-click to reset width
  const handleDoubleClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      setResizeWidth(width);
      onWidthChange?.(width);
    }
    lastClickRef.current = now;
  }, [width, onWidthChange]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (!resizable || collapsed) return;
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = currentWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = position === 'left' 
        ? moveEvent.clientX - startX 
        : startX - moveEvent.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      setResizeWidth(newWidth);
      setCurrentWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onWidthChange?.(resizeWidth);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [resizable, collapsed, currentWidth, position, minWidth, maxWidth, onWidthChange, resizeWidth]);

  // Handle scroll for memory
  const handleScroll = useCallback(() => {
    if (contentRef.current) {
      setScrollMemory(id, contentRef.current.scrollTop);
    }
  }, [id]);

  const borderStyle = showBorder
    ? position === 'left'
      ? { borderRight: `1px solid ${colors.border.subtle}` }
      : { borderLeft: `1px solid ${colors.border.subtle}` }
    : {};

  return (
    <div
      className={`dex-collapsible-panel ${className}`}
      aria-expanded={!collapsed}
      style={{
        position: 'relative',
        width: currentWidth,
        minWidth: collapsed ? collapsedWidth : undefined,
        maxWidth: collapsed ? collapsedWidth : maxWidth,
        height: '100%',
        overflow: 'hidden',
        flexShrink: 0,
        transition: isResizing ? 'none' : undefined,
        ...borderStyle,
        ...style,
      }}
    >
      {/* Header / Toggle Area */}
      {header && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${colors.border.subtle}`,
            background: colors.bg.surface,
          }}
        >
          {header}
        </div>
      )}

      {/* Content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        style={{
          height: header ? 'calc(100% - 45px)' : '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          opacity: collapsed ? 0 : 1,
          pointerEvents: collapsed ? 'none' : 'auto',
          transition: `opacity ${isReduceMotion() ? '0ms' : '150ms'} ease`,
        }}
      >
        {children}
      </div>

      {/* Resize Handle */}
      {resizable && !collapsed && (
        <div
          onMouseDown={handleResizeStart}
          onClick={handleDoubleClick}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [position === 'left' ? 'right' : 'left']: -2,
            width: 6,
            cursor: 'col-resize',
            background: isResizing ? colors.accent.soft : 'transparent',
            borderRadius: radius.xs,
            transition: 'background 0.15s ease',
            zIndex: zIndex.sticky,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLDivElement).style.background = colors.accent.soft;
          }}
          onMouseLeave={(e) => {
            if (!isResizing) {
              (e.target as HTMLDivElement).style.background = 'transparent';
            }
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Toggle Button Component
// ---------------------------------------------------------------------------

export interface PanelToggleButtonProps {
  collapsed: boolean;
  onToggle: () => void;
  position?: 'left' | 'right';
  label?: string;
}

export const PanelToggleButton: React.FC<PanelToggleButtonProps> = ({
  collapsed,
  onToggle,
  position = 'left',
  label = 'Toggle panel',
}) => {
  return (
    <button
      onClick={onToggle}
      aria-label={label}
      aria-expanded={!collapsed}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        padding: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: radius.sm,
        cursor: 'pointer',
        color: colors.text.secondary,
        transition: 'background 0.1s ease, color 0.1s ease',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLButtonElement).style.background = colors.bg.hover;
        (e.target as HTMLButtonElement).style.color = colors.text.primary;
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLButtonElement).style.background = 'transparent';
        (e.target as HTMLButtonElement).style.color = colors.text.secondary;
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 14 14"
        fill="none"
        style={{
          transform: `rotate(${collapsed ? (position === 'left' ? 0 : 180) : (position === 'left' ? 180 : 0)}deg)`,
          transition: 'transform 0.2s ease',
        }}
      >
        <path
          d="M5 2L10 7L5 12"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

export default CollapsiblePanel;
