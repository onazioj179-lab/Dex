// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * NumberInput - Scrub-to-adjust number input
 * 
 * Features:
 * - Drag left/right to adjust value
 * - Click to edit directly
 * - Shift for fine adjustment
 * - Up/Down arrow keys
 * - Double-click to reset
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, radius } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NumberInputProps {
  /** Current value */
  value: number;
  /** Value change callback */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Default value for reset */
  defaultValue?: number;
  /** Number of decimal places */
  precision?: number;
  /** Label */
  label?: string;
  /** Unit suffix (px, %, deg, etc.) */
  unit?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Width */
  width?: number | string;
  /** Show value while dragging */
  showDragPreview?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  defaultValue,
  precision = 0,
  label,
  unit,
  disabled = false,
  width = 80,
  showDragPreview = true,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const startX = useRef(0);
  const startValue = useRef(0);

  // Format value for display
  const formatValue = (v: number): string => {
    return v.toFixed(precision);
  };

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || isEditing) return;
    e.preventDefault();
    
    startX.current = e.clientX;
    startValue.current = value;
    setIsDragging(true);
  }, [disabled, isEditing, value]);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX.current;
      
      // Fine adjustment with Shift
      const sensitivity = e.shiftKey ? 0.1 : 1;
      const delta = Math.round(deltaX * sensitivity) * step;
      const newValue = Math.max(min, Math.min(max, startValue.current + delta));
      
      onChange(Number(newValue.toFixed(precision)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange, min, max, step, precision]);

  // Handle click to edit
  const handleClick = useCallback(() => {
    if (disabled || isDragging) return;
    setIsEditing(true);
    setEditValue(formatValue(value));
  }, [disabled, isDragging, value, precision]);

  // Handle edit input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  }, []);

  // Handle edit blur/submit
  const handleEditBlur = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(Number(clamped.toFixed(precision)));
    }
    setIsEditing(false);
  }, [editValue, onChange, min, max, precision]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        handleEditBlur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
      }
      return;
    }

    const multiplier = e.shiftKey ? 10 : 1;
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newValue = Math.min(max, value + step * multiplier);
      onChange(Number(newValue.toFixed(precision)));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newValue = Math.max(min, value - step * multiplier);
      onChange(Number(newValue.toFixed(precision)));
    }
  }, [isEditing, handleEditBlur, value, onChange, min, max, step, precision]);

  // Handle double-click to reset
  const handleDoubleClick = useCallback(() => {
    if (!disabled && defaultValue !== undefined) {
      onChange(defaultValue);
    }
  }, [disabled, defaultValue, onChange]);

  // Focus input when editing
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label && (
        <span
          style={{
            fontSize: 12,
            color: colors.text.secondary,
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      )}

      <div
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width,
          height: 28,
          padding: '0 8px',
          background: isEditing ? colors.bg.inset : colors.bg.hover,
          border: `1px solid ${isDragging ? colors.accent.default : colors.border.subtle}`,
          borderRadius: radius.sm,
          cursor: disabled ? 'not-allowed' : isDragging ? 'ew-resize' : 'text',
          outline: 'none',
          transition: 'border-color 0.1s ease, background 0.1s ease',
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onBlur={handleEditBlur}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              height: '100%',
              padding: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: colors.text.primary,
              textAlign: 'center',
            }}
          />
        ) : (
          <span
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: colors.text.primary,
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            {formatValue(value)}
            {unit && (
              <span style={{ color: colors.text.tertiary, marginLeft: 2 }}>
                {unit}
              </span>
            )}
          </span>
        )}

        {/* Drag indicator */}
        {isDragging && showDragPreview && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 4,
              padding: '3px 6px',
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.default}`,
              borderRadius: radius.xs,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: colors.text.primary,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {formatValue(value)}{unit}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Coordinate Input (X, Y pair)
// ---------------------------------------------------------------------------

export interface CoordinateInputProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  disabled?: boolean;
  labels?: { x: string; y: string };
}

export const CoordinateInput: React.FC<CoordinateInputProps> = ({
  x,
  y,
  onChange,
  min,
  max,
  step,
  precision,
  disabled,
  labels = { x: 'X', y: 'Y' },
}) => {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <NumberInput
        value={x}
        onChange={(v) => onChange(v, y)}
        min={min}
        max={max}
        step={step}
        precision={precision}
        disabled={disabled}
        label={labels.x}
        width={70}
      />
      <NumberInput
        value={y}
        onChange={(v) => onChange(x, v)}
        min={min}
        max={max}
        step={step}
        precision={precision}
        disabled={disabled}
        label={labels.y}
        width={70}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Size Input (Width, Height pair with link)
// ---------------------------------------------------------------------------

export interface SizeInputProps {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  disabled?: boolean;
  linked?: boolean;
  onLinkChange?: (linked: boolean) => void;
}

export const SizeInput: React.FC<SizeInputProps> = ({
  width,
  height,
  onChange,
  min = 1,
  max,
  step = 1,
  precision = 0,
  disabled,
  linked = false,
  onLinkChange,
}) => {
  const aspectRatio = useRef(width / height);

  const handleWidthChange = (newWidth: number) => {
    if (linked) {
      const newHeight = Math.round(newWidth / aspectRatio.current);
      onChange(newWidth, Math.max(min, newHeight));
    } else {
      onChange(newWidth, height);
    }
  };

  const handleHeightChange = (newHeight: number) => {
    if (linked) {
      const newWidth = Math.round(newHeight * aspectRatio.current);
      onChange(Math.max(min, newWidth), newHeight);
    } else {
      onChange(width, newHeight);
    }
  };

  // Update aspect ratio when link is toggled on
  useEffect(() => {
    if (linked) {
      aspectRatio.current = width / height;
    }
  }, [linked, width, height]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <NumberInput
        value={width}
        onChange={handleWidthChange}
        min={min}
        max={max}
        step={step}
        precision={precision}
        disabled={disabled}
        label="W"
        unit="px"
        width={70}
      />

      {/* Link button */}
      {onLinkChange && (
        <button
          onClick={() => onLinkChange(!linked)}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            background: linked ? colors.accent.soft : 'transparent',
            border: `1px solid ${linked ? colors.accent.default : colors.border.subtle}`,
            borderRadius: radius.sm,
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: linked ? colors.accent.default : colors.text.tertiary,
            transition: 'all 0.1s ease',
          }}
          title={linked ? 'Unlink dimensions' : 'Link dimensions'}
        >
          <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
            {linked ? (
              <path
                d="M5.5 7H8.5M4 5H3.5C2.12 5 1 6.12 1 7.5S2.12 10 3.5 10H5M9 5h.5c1.38 0 2.5 1.12 2.5 2.5S11.88 10 10.5 10H9"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 5H3.5C2.12 5 1 6.12 1 7.5S2.12 10 3.5 10H5M9 5h.5c1.38 0 2.5 1.12 2.5 2.5S11.88 10 10.5 10H9"
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      )}

      <NumberInput
        value={height}
        onChange={handleHeightChange}
        min={min}
        max={max}
        step={step}
        precision={precision}
        disabled={disabled}
        label="H"
        unit="px"
        width={70}
      />
    </div>
  );
};

export default NumberInput;
