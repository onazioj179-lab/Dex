// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- RangeSlider
// Sharp, precision slider: step-snapping, a live value tooltip above the thumb
// while dragging, full keyboard support (Arrow = step, Shift+Arrow = 10x,
// Home/End = bounds), an optional unit suffix, and optional tick marks.
// Controlled: drive it with `value` + `onChange`. Pure value math lives in
// ./controlMath so it can be unit-tested without a DOM.
// ===========================================================================
import React, { forwardRef, useCallback, useRef, useState } from 'react';
import { fontSize, fontWeight, radius, space } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';
import { clamp, ratioToValue, roundToStepPrecision, snapToStep, valueToPercent } from './controlMath';

// Re-export the pure helpers so consumers (and tests) can reach them from the
// component's module without depending on the internal file path.
export { clamp, snapToStep, valueToPercent } from './controlMath';

const THUMB = 14;
const TRACK_H = 4;

export interface RangeSliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  /** Current value (controlled). */
  value: number;
  /** Fires with the next clamped, step-snapped value. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Unit shown after the number in the drag tooltip, e.g. "px" or "%". */
  unit?: string;
  /** Draw tick marks. `true` derives ticks from `step`; an array places them at exact values. */
  ticks?: boolean | number[];
  /** Accessible name for the slider thumb. */
  ariaLabel?: string;
  /** Format the tooltip / aria value text. Defaults to the number + unit. */
  formatValue?: (value: number) => string;
}

const SHIFT_MULTIPLIER = 10;

/** Build the tick value list from props (DRY for render + a11y). */
function resolveTicks(ticks: boolean | number[] | undefined, min: number, max: number, step: number): number[] {
  if (Array.isArray(ticks)) return ticks.filter(t => t >= min && t <= max);
  if (ticks !== true) return [];
  if (!Number.isFinite(step) || step <= 0) return [min, max];
  const out: number[] = [];
  // Cap the count so a tiny step on a huge range can't emit thousands of nodes.
  const span = max - min;
  const count = Math.min(Math.floor(span / step), 100);
  for (let i = 0; i <= count; i++) out.push(roundToStepPrecision(min + i * step, step));
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  unit,
  ticks,
  ariaLabel,
  formatValue,
  style,
  className,
  onKeyDown,
  ...rest
}, ref) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const current = clamp(snapToStep(value, step, min), min, max);
  const percent = valueToPercent(current, min, max);
  const tickValues = resolveTicks(ticks, min, max, step);
  const showTooltip = dragging || focused;

  const label = formatValue
    ? formatValue(current)
    : `${current}${unit ? ` ${unit}` : ''}`;

  const commit = useCallback((next: number) => {
    const clamped = clamp(snapToStep(next, step, min), min, max);
    if (clamped !== current) onChange(clamped);
  }, [current, max, min, onChange, step]);

  const valueFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return current;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    return ratioToValue(ratio, min, max, step);
  }, [current, max, min, step]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    commit(valueFromClientX(e.clientX));
  }, [commit, disabled, valueFromClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    commit(valueFromClientX(e.clientX));
  }, [commit, disabled, dragging, valueFromClientX]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* capture may already be gone */ }
  }, [dragging]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (disabled) return;
    const big = e.shiftKey ? SHIFT_MULTIPLIER : 1;
    const delta = (Number.isFinite(step) && step > 0 ? step : 1) * big;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + delta; break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - delta; break;
      case 'PageUp':
        next = current + delta * SHIFT_MULTIPLIER; break;
      case 'PageDown':
        next = current - delta * SHIFT_MULTIPLIER; break;
      case 'Home':
        next = min; break;
      case 'End':
        next = max; break;
      default:
        return;
    }
    e.preventDefault();
    commit(next);
  }, [commit, current, disabled, max, min, onKeyDown, step]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: 24,
        padding: `0 ${THUMB / 2}px`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'none',
        userSelect: 'none',
        ...style,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      {...rest}
    >
      {/* Track + fill, plus the focusable thumb. The thumb carries the slider role. */}
      <div
        ref={trackRef}
        style={{ position: 'relative', flex: 1, height: TRACK_H }}
      >
        {/* Inactive track */}
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'var(--color-bg-active, #252528)',
            borderRadius: radius.full,
          }}
        />
        {/* Active fill */}
        <div
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${percent}%`,
            background: 'var(--color-accent-fill)',
            borderRadius: radius.full,
            transition: dragging ? 'none' : cssTransitions(['width'], 'micro'),
          }}
        />
        {/* Tick marks */}
        {tickValues.map((t, i) => {
          const tp = valueToPercent(t, min, max);
          return (
            <span
              key={i}
              aria-hidden="true"
              style={{
                position: 'absolute', top: '50%', left: `${tp}%`,
                width: 2, height: 2,
                transform: 'translate(-50%, -50%)',
                background: tp <= percent
                  ? 'var(--color-bg-base, #0C0C0E)'
                  : 'var(--color-text-tertiary, #8E8E93)',
                borderRadius: radius.full,
                pointerEvents: 'none',
              }}
            />
          );
        })}
        {/* Thumb (the accessible control) */}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
          aria-valuetext={label}
          aria-orientation="horizontal"
          aria-disabled={disabled || undefined}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            position: 'absolute', top: '50%', left: `${percent}%`,
            width: THUMB, height: THUMB,
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-text-primary, #fff)',
            border: '2px solid var(--color-accent, #4A9EFF)',
            borderRadius: radius.full,
            boxShadow: focused ? '0 0 0 3px rgba(74, 158, 255, 0.20)' : 'none',
            outline: 'none',
            transition: dragging ? 'none' : cssTransitions(['left', 'box-shadow'], 'micro'),
          }}
        >
          {/* Live value tooltip above the thumb while interacting. */}
          {showTooltip && (
            <span
              role="status"
              style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                transform: 'translateX(-50%)',
                padding: `2px ${space[2]}px`,
                background: 'var(--color-bg-elevated, #1A1A1E)',
                border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
                borderRadius: radius.sm,
                color: 'var(--color-text-primary, #fff)',
                fontSize: fontSize.xs,
                fontWeight: fontWeight.medium,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
RangeSlider.displayName = 'RangeSlider';
