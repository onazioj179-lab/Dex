// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- NumberStepper
// Compact numeric input with -/+ nudge buttons, min/max/step clamping, an
// optional unit suffix, and keyboard ArrowUp/ArrowDown nudging. Controlled:
// drive it with `value` + `onChange`. Clamp/snap math is the shared, tested
// helper set in ./controlMath.
// ===========================================================================
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { fontSize, input as inputTokens, radius } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';
import { clamp, roundToStepPrecision, snapToStep } from './controlMath';

export type NumberStepperSize = 'sm' | 'md' | 'lg';

export interface NumberStepperProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size' | 'type'> {
  /** Current value (controlled). */
  value: number;
  /** Fires with the next clamped, step-snapped value. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: NumberStepperSize;
  disabled?: boolean;
  /** Unit suffix shown inside the field, e.g. "px". */
  unit?: string;
  /** Accessible name when no visible label is wired via Field. */
  ariaLabel?: string;
}

const FOCUS_TRANSITION = cssTransitions(['border-color', 'box-shadow'], 'focusGlow');

/** Clamp + snap a value to the stepper's constraints (shared by all entry paths). */
export function clampStepper(value: number, min: number, max: number, step: number): number {
  // NaN has no position on the line -> fall back to a clamped 0. ±Infinity DO
  // have a direction, so let clamp pull them to the near bound (max / min).
  if (Number.isNaN(value)) return clamp(0, min, max);
  if (!Number.isFinite(value)) return clamp(value, min, max);
  return clamp(snapToStep(value, step, min), min, max);
}

const Chevron: React.FC<{ dir: 'up' | 'down' }> = ({ dir }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'up' ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
  </svg>
);

export const NumberStepper = forwardRef<HTMLInputElement, NumberStepperProps>(({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  size = 'md',
  disabled = false,
  unit,
  ariaLabel,
  style,
  onKeyDown,
  onBlur,
  ...rest
}, ref) => {
  const height = inputTokens.height[size];
  const stepSize = Number.isFinite(step) && step > 0 ? step : 1;
  const current = clampStepper(value, min, max, step);

  // Local text buffer so partially-typed values ("-", "1.") aren't clobbered
  // mid-keystroke; the committed numeric value still flows through onChange.
  const [text, setText] = useState<string>(() => String(current));
  const editingRef = useRef(false);

  // Keep the buffer in sync with external value changes when not actively typing.
  useEffect(() => {
    if (!editingRef.current) setText(String(current));
  }, [current]);

  const commit = useCallback((next: number) => {
    const clamped = clampStepper(next, min, max, step);
    if (clamped !== current) onChange(clamped);
    return clamped;
  }, [current, max, min, onChange, step]);

  const nudge = useCallback((dir: 1 | -1) => {
    if (disabled) return;
    commit(roundToStepPrecision(current + dir * stepSize, stepSize));
  }, [commit, current, disabled, stepSize]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    editingRef.current = true;
    setText(e.target.value);
    const parsed = Number(e.target.value);
    // Live-commit only when the buffer is a complete, finite number.
    if (e.target.value.trim() !== '' && Number.isFinite(parsed)) commit(parsed);
  }, [commit]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    editingRef.current = false;
    const parsed = Number(text);
    const settled = Number.isFinite(parsed) && text.trim() !== '' ? commit(parsed) : current;
    setText(String(settled));
    e.currentTarget.style.borderColor = 'var(--color-border, rgba(255,255,255,0.14))';
    e.currentTarget.style.boxShadow = 'none';
    onBlur?.(e);
  }, [commit, current, onBlur, text]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (disabled) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
    else if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); }
  }, [disabled, nudge, onKeyDown]);

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: height - 2, height: '100%',
    border: 'none', background: 'transparent',
    color: 'var(--color-text-secondary, #B8B8BD)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: 0, flexShrink: 0,
    transition: cssTransitions(['background', 'color'], 'micro'),
  };

  const atMin = current <= min;
  const atMax = current >= max;

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center',
        height,
        background: 'var(--color-bg-inset, #101012)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
        borderRadius: radius.md,
        overflow: 'hidden',
        opacity: disabled ? 0.55 : 1,
        transition: FOCUS_TRANSITION,
        ...style,
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Decrease"
        disabled={disabled || atMin}
        onClick={() => nudge(-1)}
        style={{ ...btnStyle, opacity: disabled || atMin ? 0.4 : 1, cursor: disabled || atMin ? 'not-allowed' : 'pointer' }}
      >
        <Chevron dir="down" />
      </button>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuenow={current}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={unit ? `${current} ${unit}` : undefined}
        disabled={disabled}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--color-accent, #4A9EFF)';
        }}
        style={{
          width: 44,
          flex: 1,
          minWidth: 0,
          height: '100%',
          textAlign: 'center',
          border: 'none', background: 'transparent', outline: 'none',
          color: 'var(--color-text-primary, #fff)',
          fontFamily: 'inherit',
          fontSize: size === 'sm' ? fontSize.xs : fontSize.sm,
          // The borderColor flip on focus targets a hidden border so the wrapper
          // stays the source of truth; reset it here so it never paints.
          borderColor: 'transparent',
        }}
        {...rest}
      />
      {unit && (
        <span
          aria-hidden="true"
          style={{
            paddingRight: 6,
            color: 'var(--color-text-tertiary, #8E8E93)',
            fontSize: fontSize.xs,
            fontFamily: 'inherit',
            pointerEvents: 'none',
          }}
        >
          {unit}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Increase"
        disabled={disabled || atMax}
        onClick={() => nudge(1)}
        style={{ ...btnStyle, opacity: disabled || atMax ? 0.4 : 1, cursor: disabled || atMax ? 'not-allowed' : 'pointer' }}
      >
        <Chevron dir="up" />
      </button>
    </div>
  );
});
NumberStepper.displayName = 'NumberStepper';
