// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- SegmentedControl
// A row of mutually-exclusive options with a sharp accent active indicator.
// Controlled: drive it with `value` + `onChange`. Implements the radiogroup
// pattern -- roving tabindex, Arrow/Home/End navigation, role=radio per option.
// ===========================================================================
import React, { forwardRef, useCallback, useRef } from 'react';
import { fontSize, fontWeight, radius, space } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';

export type SegmentedSize = 'sm' | 'md' | 'lg';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Optional leading SVG icon (no emojis). */
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Selected option value (controlled). */
  value: T;
  /** Available options, rendered left to right. */
  options: SegmentedOption<T>[];
  /** Fires with the newly selected value. */
  onChange: (value: T) => void;
  size?: SegmentedSize;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Accessible name for the group. */
  ariaLabel?: string;
}

const HEIGHT: Record<SegmentedSize, number> = { sm: 26, md: 30, lg: 36 };

/** Index of the next selectable option in `dir`, skipping disabled ones (wraps). */
function nextEnabledIndex<T extends string>(
  options: SegmentedOption<T>[],
  from: number,
  dir: 1 | -1,
): number {
  const n = options.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + dir * i + n * i) % n;
    if (!options[idx]?.disabled) return idx;
  }
  return from;
}

function SegmentedControlInner<T extends string = string>(
  {
    value,
    options,
    onChange,
    size = 'md',
    disabled = false,
    fullWidth = false,
    ariaLabel,
    style,
    onKeyDown,
    ...rest
  }: SegmentedControlProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const height = HEIGHT[size];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex(o => o.value === value);

  const select = useCallback((idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled || disabled) return;
    if (opt.value !== value) onChange(opt.value);
    refs.current[idx]?.focus();
  }, [disabled, onChange, options, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (disabled) return;
    const from = selectedIndex < 0 ? 0 : selectedIndex;
    let target: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = nextEnabledIndex(options, from, 1); break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = nextEnabledIndex(options, from, -1); break;
      case 'Home':
        target = nextEnabledIndex(options, -1, 1); break;
      case 'End':
        target = nextEnabledIndex(options, 0, -1); break;
      default:
        return;
    }
    e.preventDefault();
    if (target !== null) select(target);
  }, [disabled, onKeyDown, options, select, selectedIndex]);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        height,
        padding: 2,
        gap: 2,
        background: 'var(--color-bg-inset, #101012)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
        borderRadius: radius.md,
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
      {...rest}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value;
        const isDisabled = disabled || !!opt.disabled;
        // Roving tabindex: only the active (or first, if none active) option is tabbable.
        const tabbable = active || (selectedIndex < 0 && idx === 0);
        return (
          <button
            key={opt.value}
            ref={el => { refs.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={typeof opt.label === 'string' ? opt.label : undefined}
            disabled={isDisabled}
            tabIndex={isDisabled ? -1 : tabbable ? 0 : -1}
            onClick={() => select(idx)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: space[1],
              flex: fullWidth ? 1 : undefined,
              height: '100%',
              padding: `0 ${size === 'sm' ? 10 : 12}px`,
              border: 'none',
              borderRadius: radius.sm,
              background: active ? 'var(--color-accent, #4A9EFF)' : 'transparent',
              color: active
                ? 'var(--color-accent-text, #fff)'
                : 'var(--color-text-secondary, #B8B8BD)',
              fontFamily: 'inherit',
              fontSize: size === 'sm' ? fontSize.xs : fontSize.sm,
              fontWeight: active ? fontWeight.semibold : fontWeight.medium,
              whiteSpace: 'nowrap',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.45 : 1,
              outline: 'none',
              transition: cssTransitions(['background', 'color'], 'micro'),
            }}
            onFocus={e => {
              if (!active) e.currentTarget.style.background = 'var(--color-bg-hover, #1E1E22)';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(74, 158, 255, 0.20)';
            }}
            onBlur={e => {
              if (!active) e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {opt.icon && <span style={{ display: 'inline-flex' }}>{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// forwardRef with a generic requires a cast to preserve the type parameter.
export const SegmentedControl = forwardRef(SegmentedControlInner) as <T extends string = string>(
  props: SegmentedControlProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof SegmentedControlInner>;
