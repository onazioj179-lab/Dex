// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- TextInput + Textarea
// Tokenized text controls with consistent focus ring + invalid state.
// ===========================================================================
import React, { forwardRef } from 'react';
import { fontSize, radius, input as inputTokens } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';

const FOCUS_TRANSITION = cssTransitions(['border-color', 'box-shadow'], 'focusGlow');

export type InputSize = 'sm' | 'md' | 'lg';

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  invalid?: boolean;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

const sharedField = (size: InputSize, invalid: boolean): React.CSSProperties => ({
  height: inputTokens.height[size],
  width: '100%',
  padding: size === 'sm' ? '0 10px' : size === 'lg' ? '0 14px' : '0 12px',
  fontSize: size === 'sm' ? fontSize.xs : fontSize.sm,
  fontFamily: 'inherit',
  color: 'var(--color-text-primary, #fff)',
  background: 'var(--color-bg-inset, #101012)',
  border: `1px solid ${invalid ? 'var(--color-error, #FF453A)' : 'var(--color-border-control, #6B6D73)'}`,
  borderRadius: radius.md,
  outline: 'none',
  transition: FOCUS_TRANSITION,
});

const focusOn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, invalid: boolean) => {
  const el = e.currentTarget;
  el.style.borderColor = invalid ? 'var(--color-error, #FF453A)' : 'var(--dex-focus-color, #fff)';
  el.style.boxShadow = invalid
    ? '0 0 0 3px rgba(255, 69, 58, 0.18)'
    : '0 0 0 3px var(--dex-focus-glow, rgba(255, 255, 255, 0.22))';
};

const focusOff = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>, invalid: boolean) => {
  const el = e.currentTarget;
  el.style.borderColor = invalid ? 'var(--color-error, #FF453A)' : 'var(--color-border-control, #6B6D73)';
  el.style.boxShadow = 'none';
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(({
  inputSize = 'md', invalid = false, leftAddon, rightAddon, style, onFocus, onBlur, ...rest
}, ref) => {
  if (leftAddon || rightAddon) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--color-bg-inset, #101012)',
          border: `1px solid ${invalid ? 'var(--color-error, #FF453A)' : 'var(--color-border-control, #6B6D73)'}`,
          borderRadius: radius.md,
          height: inputTokens.height[inputSize],
          padding: '0 var(--space-2)',
          gap: 6,
          transition: FOCUS_TRANSITION,
        }}
      >
        {leftAddon && <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>{leftAddon}</span>}
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          onFocus={e => { focusOn(e, invalid); onFocus?.(e); }}
          onBlur={e => { focusOff(e, invalid); onBlur?.(e); }}
          style={{
            flex: 1,
            border: 'none', background: 'transparent', outline: 'none',
            color: 'var(--color-text-primary, #fff)',
            fontFamily: 'inherit',
            fontSize: inputSize === 'sm' ? fontSize.xs : fontSize.sm,
            ...style,
          }}
          {...rest}
        />
        {rightAddon && <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>{rightAddon}</span>}
      </div>
    );
  }
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      onFocus={e => { focusOn(e, invalid); onFocus?.(e); }}
      onBlur={e => { focusOff(e, invalid); onBlur?.(e); }}
      style={{ ...sharedField(inputSize, invalid), ...style }}
      {...rest}
    />
  );
});
TextInput.displayName = 'TextInput';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  inputSize?: InputSize;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  invalid = false, inputSize = 'md', style, onFocus, onBlur, rows = 4, ...rest
}, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    aria-invalid={invalid || undefined}
    onFocus={e => { focusOn(e, invalid); onFocus?.(e); }}
    onBlur={e => { focusOff(e, invalid); onBlur?.(e); }}
    style={{
      ...sharedField(inputSize, invalid),
      height: 'auto',
      padding: 10,
      lineHeight: 1.5,
      resize: 'vertical',
      ...style,
    }}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';
