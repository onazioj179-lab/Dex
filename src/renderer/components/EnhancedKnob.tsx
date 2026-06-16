// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * EnhancedKnob - Professional rotary knob control
 * 
 * Features:
 * - Smooth rotation animation
 * - Fine-tune mode (Shift = 10x precision)
 * - Double-click to reset
 * - Value tooltip on drag
 * - Touch support
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { colors, radius } from '../styles/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnhancedKnobProps {
  /** Current value (0-1 normalized) */
  value: number;
  /** Value change callback */
  onChange: (value: number) => void;
  /** Minimum value for display */
  min?: number;
  /** Maximum value for display */
  max?: number;
  /** Step increment */
  step?: number;
  /** Default value for reset */
  defaultValue?: number;
  /** Knob size in pixels */
  size?: number;
  /** Label text */
  label?: string;
  /** Value format function */
  formatValue?: (value: number) => string;
  /** Disabled state */
  disabled?: boolean;
  /** Color accent */
  color?: string;
  /** Show value tooltip on drag */
  showTooltip?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EnhancedKnob: React.FC<EnhancedKnobProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 0.5,
  size = 48,
  label,
  formatValue = (v) => Math.round(v * (max - min) + min).toString(),
  disabled = false,
  color = colors.accent.default,
  showTooltip = true,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  // Rotation angle: -135deg to +135deg (270deg total sweep)
  const angle = (value * 270) - 135;

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startY.current = clientY;
    startValue.current = value;
    setIsDragging(true);
    setShowValue(true);
  }, [disabled, value]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = startY.current - clientY;

      // Fine-tune mode with Shift key
      const sensitivity = (e as MouseEvent).shiftKey ? 0.001 : 0.005;
      const newValue = Math.max(0, Math.min(1, startValue.current + deltaY * sensitivity));

      // Snap to step
      const range = max - min;
      const stepNormalized = step / range;
      const snappedValue = Math.round(newValue / stepNormalized) * stepNormalized;

      // Coalesce to one onChange per frame: a drag fires mousemove far faster
      // than the display refreshes, so per-event onChange just thrashes renders.
      pending = snappedValue;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    let rafId = 0;
    let pending = startValue.current;
    const flush = () => { rafId = 0; onChange(pending); };

    const handleUp = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      onChange(pending); // commit the final value
      setIsDragging(false);
      setTimeout(() => setShowValue(false), 400);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, onChange, min, max, step]);

  // Double-click to reset
  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      onChange(defaultValue);
    }
  }, [disabled, defaultValue, onChange]);

  const strokeWidth = size * 0.08;
  const trackRadius = (size - strokeWidth) / 2 - 4;
  const circumference = 2 * Math.PI * trackRadius;
  const arcLength = (270 / 360) * circumference;
  const valueArcLength = value * arcLength;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        opacity: disabled ? 0.4 : 1,
        userSelect: 'none',
      }}
    >
      {/* Knob */}
      <div
        ref={knobRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          position: 'relative',
          width: size,
          height: size,
          cursor: disabled ? 'not-allowed' : 'ns-resize',
        }}
      >
        {/* SVG Track and Value Arc */}
        <svg
          width={size}
          height={size}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={trackRadius}
            fill="none"
            stroke={colors.bg.hover}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={-arcLength * 0.5}
            strokeLinecap="round"
            transform={`rotate(135 ${size / 2} ${size / 2})`}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={trackRadius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${valueArcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(135 ${size / 2} ${size / 2})`}
            style={{
              transition: isDragging ? 'none' : 'stroke-dasharray 0.1s ease',
              filter: isDragging ? `drop-shadow(0 0 4px ${color})` : 'none',
            }}
          />
        </svg>

        {/* Center knob */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: size * 0.55,
            height: size * 0.55,
            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            background: `linear-gradient(135deg, ${colors.bg.elevated} 0%, ${colors.bg.surface} 100%)`,
            borderRadius: '50%',
            border: `1px solid ${colors.border.subtle}`,
            boxShadow: isDragging
              ? `0 2px 8px rgba(0,0,0,0.4), 0 0 12px ${color}40`
              : '0 2px 6px rgba(0,0,0,0.3)',
            transition: isDragging ? 'none' : 'transform 0.1s ease, box-shadow 0.15s ease',
          }}
        >
          {/* Indicator line */}
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: '50%',
              width: 2,
              height: size * 0.15,
              background: color,
              borderRadius: 2,
              transform: 'translateX(-50%)',
            }}
          />
        </div>

        {/* Value tooltip */}
        {showTooltip && showValue && (
          <div
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '4px var(--space-2)',
              background: colors.bg.elevated,
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.sm,
              fontSize: 11,
              fontWeight: 600,
              color: colors.text.primary,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: 'var(--pg-shadow-chip)',
              animation: 'fadeIn 0.1s ease',
            }}
          >
            {formatValue(value)}
          </div>
        )}
      </div>

      {/* Label */}
      {label && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: colors.text.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Enhanced Slider with scrubbing
// ---------------------------------------------------------------------------

export interface EnhancedSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  label?: string;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  vertical?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  showValue?: boolean;
}

export const EnhancedSlider: React.FC<EnhancedSliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  label,
  formatValue = (v) => v.toFixed(0),
  disabled = false,
  vertical = false,
  size = 'md',
  color = colors.accent.default,
  showValue = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const sizes = {
    sm: { track: 3, thumb: 12 },
    md: { track: 4, thumb: 16 },
    lg: { track: 6, thumb: 20 },
  };
  const { track: trackSize, thumb: thumbSize } = sizes[size];

  const normalized = (value - min) / (max - min);

  const handleInteraction = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (disabled || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const clientPos = 'touches' in e 
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

    let ratio: number;
    if (vertical) {
      ratio = 1 - (clientPos.y - rect.top) / rect.height;
    } else {
      ratio = (clientPos.x - rect.left) / rect.width;
    }

    ratio = Math.max(0, Math.min(1, ratio));
    const newValue = min + ratio * (max - min);
    
    // Snap to step
    const snapped = Math.round(newValue / step) * step;
    onChange(Math.max(min, Math.min(max, snapped)));
  }, [disabled, vertical, min, max, step, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    handleInteraction(e);
  }, [disabled, handleInteraction]);

  useEffect(() => {
    if (!isDragging) return;

    // Coalesce drag updates to one per frame; the mousedown click still runs
    // handleInteraction synchronously for immediate response.
    let rafId = 0;
    let lastEvent: MouseEvent | TouchEvent | null = null;
    const flush = () => { rafId = 0; if (lastEvent) handleInteraction(lastEvent); };
    const handleMove = (e: MouseEvent | TouchEvent) => {
      lastEvent = e;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };
    const handleUp = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (lastEvent) handleInteraction(lastEvent); // commit final position
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, handleInteraction]);

  const handleDoubleClick = useCallback(() => {
    if (!disabled && defaultValue !== undefined) {
      onChange(defaultValue);
    }
  }, [disabled, defaultValue, onChange]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 'var(--space-2)',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label && (
        <span style={{ fontSize: 12, color: colors.text.secondary, minWidth: 60 }}>
          {label}
        </span>
      )}
      
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{
          position: 'relative',
          width: vertical ? trackSize : '100%',
          height: vertical ? 100 : trackSize,
          minWidth: vertical ? undefined : 80,
          background: colors.bg.hover,
          borderRadius: trackSize / 2,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {/* Filled track */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: vertical ? 0 : undefined,
            top: vertical ? undefined : 0,
            width: vertical ? '100%' : `${normalized * 100}%`,
            height: vertical ? `${normalized * 100}%` : '100%',
            background: color,
            borderRadius: trackSize / 2,
            transition: isDragging ? 'none' : 'width 0.1s ease, height 0.1s ease',
          }}
        />

        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            left: vertical ? '50%' : `${normalized * 100}%`,
            bottom: vertical ? `${normalized * 100}%` : undefined,
            top: vertical ? undefined : '50%',
            width: thumbSize,
            height: thumbSize,
            transform: `translate(-50%, ${vertical ? '50%' : '-50%'})`,
            background: '#fff',
            borderRadius: '50%',
            boxShadow: isDragging
              ? `0 2px 8px rgba(0,0,0,0.4), 0 0 0 3px ${color}40`
              : '0 1px 4px rgba(0,0,0,0.3)',
            transition: isDragging ? 'none' : 'left 0.1s ease, bottom 0.1s ease, box-shadow 0.15s ease',
          }}
        />
      </div>

      {showValue && (
        <span style={{ fontSize: 12, color: colors.text.primary, minWidth: 36, textAlign: 'right' }}>
          {formatValue(value)}
        </span>
      )}
    </div>
  );
};

export default EnhancedKnob;
