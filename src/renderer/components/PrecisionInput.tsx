// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PrecisionInput — Micro-control for fine numeric value adjustment
 *
 * Features:
 * - Click-drag to scrub value
 * - Shift+drag for fine adjust (0.1× speed)
 * - Scroll wheel to adjust
 * - Double-click to type exact value
 * - Right-click to reset to default
 * - Arrow keys for step increment
 */

import React, { useState, useRef, useCallback, useEffect, memo } from 'react';

interface PrecisionInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  label?: string;
  unit?: string;
  precision?: number;
  disabled?: boolean;
  width?: number;
}

const PrecisionInput: React.FC<PrecisionInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  label,
  unit = '',
  precision = 1,
  disabled = false,
  width = 80,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef({ x: 0, startValue: 0 });

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);
  const round = useCallback((v: number) => {
    const factor = Math.pow(10, precision);
    return Math.round(v * factor) / factor;
  }, [precision]);

  // Drag to scrub
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || editing || e.button !== 0) return;
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, startValue: value };
    setDragging(true);
  }, [disabled, editing, value]);

  useEffect(() => {
    if (!dragging) return;
    let rafId = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const dx = e.clientX - dragStartRef.current.x;
        const speed = e.shiftKey ? 0.1 : 1;
        const delta = dx * step * speed;
        const newValue = clamp(round(dragStartRef.current.startValue + delta));
        onChange(newValue);
      });
    };
    const handleUp = () => { cancelAnimationFrame(rafId); setDragging(false); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, step, clamp, round, onChange]);

  // Scroll to adjust — RAF-throttled to prevent rapid fire
  const wheelRafRef = useRef(0);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (disabled || editing) return;
    e.preventDefault();
    cancelAnimationFrame(wheelRafRef.current);
    const deltaY = e.deltaY;
    const shift = e.shiftKey;
    wheelRafRef.current = requestAnimationFrame(() => {
      const speed = shift ? 0.1 : 1;
      const delta = deltaY > 0 ? -step * speed : step * speed;
      onChange(clamp(round(value + delta)));
    });
  }, [disabled, editing, step, value, clamp, round, onChange]);

  // Double-click to type
  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    setEditValue(String(value));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [disabled, value]);

  // Commit typed value
  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) onChange(clamp(round(parsed)));
  }, [editValue, clamp, round, onChange]);

  // Right-click to reset
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled || defaultValue === undefined) return;
    e.preventDefault();
    onChange(defaultValue);
  }, [disabled, defaultValue, onChange]);

  // Arrow keys
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') setEditing(false);
      return;
    }
    const speed = e.shiftKey ? 0.1 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(clamp(round(value + step * speed)));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(clamp(round(value - step * speed)));
    }
  }, [editing, commitEdit, step, value, clamp, round, onChange]);

  const pct = max !== min ? ((value - min) / (max - min)) * 100 : 0;
  const displayValue = precision === 0 ? String(Math.round(value)) : value.toFixed(precision);

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : dragging ? 'ew-resize' : 'default',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={label || 'Precision input'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      {label && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', userSelect: 'none' }}>
          {label}
        </span>
      )}
      <div
        style={{
          position: 'relative', width, height: 22, borderRadius: 3,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)',
          overflow: 'hidden', userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      >
        {/* Fill bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: 'rgba(10,132,255,0.15)',
          transition: dragging ? 'none' : 'width 0.1s ease',
        }} />

        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            style={{
              position: 'absolute', inset: 0, width: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: 11, fontWeight: 600,
              textAlign: 'center', fontFamily: '"SF Mono", monospace',
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, fontFamily: '"SF Mono", monospace',
            color: 'var(--color-text-primary)',
          }}>
            {displayValue}{unit && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{unit}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

PrecisionInput.displayName = 'PrecisionInput';
export default memo(PrecisionInput);
