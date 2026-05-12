// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ToolContextMenu - Right-click tool options dropdown for creative apps
 * 
 * Features:
 * - Quick tool switching
 * - Tool-specific options
 * - Keyboard shortcuts display
 * - Sub-tool selection
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors, radius, zIndex } from '../styles/tokens';
import { SPRING_PRESETS, isReduceMotion } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  type?: 'item' | 'checkbox' | 'radio' | 'separator' | 'header';
  group?: string;
  children?: ToolOption[];
  onClick?: () => void;
}

export interface ToolContextMenuProps {
  /** Menu items */
  items: ToolOption[];
  /** Position to show menu */
  position: { x: number; y: number };
  /** Close callback */
  onClose: () => void;
  /** Title for the menu */
  title?: string;
  /** Width */
  width?: number;
}

// ---------------------------------------------------------------------------
// Hook for tool context menu
// ---------------------------------------------------------------------------

export function useToolContextMenu() {
  const [state, setState] = useState<{
    items: ToolOption[];
    position: { x: number; y: number };
    title?: string;
  } | null>(null);

  const show = useCallback((
    e: React.MouseEvent,
    items: ToolOption[],
    title?: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ items, position: { x: e.clientX, y: e.clientY }, title });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { state, show, close };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ToolContextMenu: React.FC<ToolContextMenuProps> = ({
  items,
  position,
  onClose,
  title,
  width = 220,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [isVisible, setIsVisible] = useState(false);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Adjust position to stay in viewport
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    
    setAdjustedPos({ x, y });
  }, [position]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      const actionItems = items.filter(i => i.type !== 'separator' && i.type !== 'header');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx(prev => {
          let next = prev + 1;
          while (next < actionItems.length && actionItems[next].disabled) next++;
          return next < actionItems.length ? next : prev;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx(prev => {
          let next = prev - 1;
          while (next >= 0 && actionItems[next].disabled) next--;
          return next >= 0 ? next : prev;
        });
      } else if (e.key === 'Enter' && focusIdx >= 0) {
        e.preventDefault();
        const item = actionItems[focusIdx];
        if (item && !item.disabled) {
          item.onClick?.();
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose, items, focusIdx]);

  let actionIdx = -1;

  const content = (
    <div
      ref={menuRef}
      role="menu"
      aria-label={title || 'Tool options'}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: zIndex.contextMenu,
        width,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: 'var(--color-bg-glass-strong, rgba(28, 28, 32, 0.98))',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.lg,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08)',
        padding: '4px 0',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: 'top left',
        transition: isReduceMotion() ? 'none' : 'opacity 0.12s ease, transform 0.12s ease',
      }}
    >
      {/* Title */}
      {title && (
        <div
          style={{
            padding: '8px 12px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: colors.text.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderBottom: `1px solid ${colors.border.subtle}`,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
      )}

      {/* Items */}
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                background: colors.border.subtle,
                margin: '4px 8px',
              }}
            />
          );
        }

        if (item.type === 'header') {
          return (
            <div
              key={`header-${i}`}
              style={{
                padding: '8px 12px 4px',
                fontSize: 10,
                fontWeight: 600,
                color: colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {item.label}
            </div>
          );
        }

        const curActionIdx = ++actionIdx;
        const isFocused = curActionIdx === focusIdx;

        return (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            aria-disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: 'calc(100% - 8px)',
              margin: '0 4px',
              padding: '7px 10px',
              gap: 10,
              background: isFocused ? colors.accent.soft : 'transparent',
              border: 'none',
              borderRadius: radius.sm,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              fontSize: 13,
              fontWeight: 500,
              color: item.disabled ? colors.text.disabled : colors.text.primary,
              outline: isFocused ? `2px solid ${colors.accent.default}` : 'none',
              outlineOffset: -2,
              transition: 'background 0.08s ease',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.target as HTMLButtonElement).style.background = 'rgba(74, 158, 255, 0.12)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isFocused) {
                (e.target as HTMLButtonElement).style.background = 'transparent';
              }
            }}
          >
            {/* Checkbox/Radio indicator */}
            {(item.type === 'checkbox' || item.type === 'radio') && (
              <span
                style={{
                  width: 16,
                  height: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: item.type === 'radio' ? '50%' : radius.xs,
                  border: `1.5px solid ${item.checked ? colors.accent.default : colors.border.strong}`,
                  background: item.checked ? colors.accent.default : 'transparent',
                  flexShrink: 0,
                }}
              >
                {item.checked && item.type === 'checkbox' && (
                  <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {item.checked && item.type === 'radio' && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                )}
              </span>
            )}

            {/* Icon */}
            {item.icon && (
              <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </span>
            )}

            {/* Label */}
            <span style={{ flex: 1 }}>{item.label}</span>

            {/* Shortcut */}
            {item.shortcut && (
              <span
                style={{
                  fontSize: 11,
                  color: colors.text.tertiary,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {item.shortcut}
              </span>
            )}

            {/* Submenu arrow */}
            {item.children && item.children.length > 0 && (
              <svg width={12} height={12} viewBox="0 0 12 12" fill="none" style={{ marginLeft: 4 }}>
                <path d="M4 2L8 6L4 10" stroke={colors.text.tertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );

  return createPortal(content, document.body);
};

// ---------------------------------------------------------------------------
// Preset tool menus for creative apps
// ---------------------------------------------------------------------------

export const SELECTION_TOOL_OPTIONS: ToolOption[] = [
  { id: 'select-rect', label: 'Rectangle Select', shortcut: 'M', type: 'radio', group: 'shape' },
  { id: 'select-ellipse', label: 'Ellipse Select', shortcut: 'Shift+M', type: 'radio', group: 'shape' },
  { id: 'select-lasso', label: 'Lasso Select', shortcut: 'L', type: 'radio', group: 'shape' },
  { id: 'select-polygon', label: 'Polygon Lasso', shortcut: 'Shift+L', type: 'radio', group: 'shape' },
  { id: 'select-magic', label: 'Magic Wand', shortcut: 'W', type: 'radio', group: 'shape' },
  { type: 'separator', id: 'sep1', label: '' },
  { type: 'header', id: 'h1', label: 'Selection Mode' },
  { id: 'mode-replace', label: 'Replace', type: 'radio', group: 'mode', checked: true },
  { id: 'mode-add', label: 'Add to Selection', shortcut: 'Shift', type: 'radio', group: 'mode' },
  { id: 'mode-subtract', label: 'Subtract', shortcut: 'Alt', type: 'radio', group: 'mode' },
  { id: 'mode-intersect', label: 'Intersect', shortcut: 'Shift+Alt', type: 'radio', group: 'mode' },
  { type: 'separator', id: 'sep2', label: '' },
  { id: 'feather', label: 'Feather...', shortcut: 'Shift+F6' },
  { id: 'refine-edge', label: 'Refine Edge...' },
];

export const BRUSH_TOOL_OPTIONS: ToolOption[] = [
  { id: 'brush', label: 'Brush', shortcut: 'B', type: 'radio', group: 'tool' },
  { id: 'pencil', label: 'Pencil', shortcut: 'Shift+B', type: 'radio', group: 'tool' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', type: 'radio', group: 'tool' },
  { id: 'clone', label: 'Clone Stamp', shortcut: 'S', type: 'radio', group: 'tool' },
  { id: 'heal', label: 'Healing Brush', shortcut: 'J', type: 'radio', group: 'tool' },
  { type: 'separator', id: 'sep1', label: '' },
  { type: 'header', id: 'h1', label: 'Brush Options' },
  { id: 'size', label: 'Brush Size...', shortcut: '[  ]' },
  { id: 'hardness', label: 'Hardness...' },
  { id: 'opacity', label: 'Opacity...', shortcut: '1-9' },
  { id: 'flow', label: 'Flow...' },
  { type: 'separator', id: 'sep2', label: '' },
  { id: 'pressure', label: 'Pen Pressure', type: 'checkbox', checked: true },
  { id: 'smoothing', label: 'Smoothing', type: 'checkbox', checked: true },
];

export const TRANSFORM_TOOL_OPTIONS: ToolOption[] = [
  { id: 'move', label: 'Move', shortcut: 'V', type: 'radio', group: 'tool' },
  { id: 'scale', label: 'Scale', shortcut: 'Cmd+T', type: 'radio', group: 'tool' },
  { id: 'rotate', label: 'Rotate', type: 'radio', group: 'tool' },
  { id: 'skew', label: 'Skew', type: 'radio', group: 'tool' },
  { id: 'distort', label: 'Distort', type: 'radio', group: 'tool' },
  { id: 'perspective', label: 'Perspective', type: 'radio', group: 'tool' },
  { id: 'warp', label: 'Warp', type: 'radio', group: 'tool' },
  { type: 'separator', id: 'sep1', label: '' },
  { id: 'flip-h', label: 'Flip Horizontal' },
  { id: 'flip-v', label: 'Flip Vertical' },
  { id: 'rotate-90cw', label: 'Rotate 90 CW' },
  { id: 'rotate-90ccw', label: 'Rotate 90 CCW' },
];

export const ZOOM_TOOL_OPTIONS: ToolOption[] = [
  { id: 'zoom-in', label: 'Zoom In', shortcut: 'Cmd++' },
  { id: 'zoom-out', label: 'Zoom Out', shortcut: 'Cmd+-' },
  { id: 'fit-screen', label: 'Fit to Screen', shortcut: 'Cmd+0' },
  { id: 'actual-size', label: 'Actual Size (100%)', shortcut: 'Cmd+1' },
  { type: 'separator', id: 'sep1', label: '' },
  { id: 'zoom-50', label: '50%' },
  { id: 'zoom-100', label: '100%' },
  { id: 'zoom-200', label: '200%' },
  { id: 'zoom-400', label: '400%' },
];

export default ToolContextMenu;
