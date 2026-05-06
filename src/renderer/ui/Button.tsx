// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX UI -- Button + IconButton
// Single source of truth for clickable controls. Variants are derived from
// design tokens so every screen feels the same. No emojis: pass an SVG via
// `leftIcon` / `rightIcon`.
// ===========================================================================
import React, { forwardRef } from 'react';
import { space, radius, fontSize, fontWeight, transition, button as buttonTokens } from '../styles/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const variantStyle = (variant: ButtonVariant): React.CSSProperties => {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--color-accent, #4A9EFF)',
        color: '#fff',
        border: '1px solid transparent',
      };
    case 'secondary':
      return {
        background: 'var(--color-bg-elevated, #1A1A1E)',
        color: 'var(--color-text-primary, #fff)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--color-text-secondary, #B8B8BD)',
        border: '1px solid transparent',
      };
    case 'subtle':
      return {
        background: 'var(--color-bg-hover, #1E1E22)',
        color: 'var(--color-text-primary, #fff)',
        border: '1px solid transparent',
      };
    case 'danger':
      return {
        background: 'rgba(255, 69, 58, 0.10)',
        color: '#FF6B61',
        border: '1px solid rgba(255, 69, 58, 0.30)',
      };
  }
};

const sizeStyle = (size: ButtonSize): React.CSSProperties => ({
  height: buttonTokens.height[size],
  fontSize: size === 'sm' ? fontSize.xs : size === 'lg' ? fontSize.base : fontSize.sm,
  padding: size === 'sm' ? '0 10px' : size === 'lg' ? '0 18px' : '0 14px',
  gap: space[2],
});

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  children,
  ...rest
}, ref) => {
  const isDisabled = disabled || loading;
  const v = variantStyle(variant);
  const s = sizeStyle(size);
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={isDisabled}
      data-variant={variant}
      data-size={size}
      onMouseEnter={e => {
        if (!isDisabled) {
          const el = e.currentTarget;
          if (variant === 'primary') el.style.background = 'var(--color-accent-hover, #6CB2FF)';
          else if (variant === 'ghost') el.style.background = 'var(--color-bg-hover, #1E1E22)';
          else if (variant === 'secondary') el.style.background = 'var(--color-bg-hover, #1E1E22)';
          else if (variant === 'subtle') el.style.background = 'var(--color-bg-active, #252528)';
          else if (variant === 'danger') el.style.background = 'rgba(255, 69, 58, 0.18)';
        }
        onMouseEnter?.(e);
      }}
      onMouseLeave={e => {
        if (!isDisabled) {
          (e.currentTarget as HTMLElement).style.background = v.background as string;
        }
        onMouseLeave?.(e);
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        borderRadius: radius.md,
        fontFamily: 'inherit',
        fontWeight: fontWeight.semibold,
        whiteSpace: 'nowrap',
        transition: `background ${transition.fast}, color ${transition.fast}, border-color ${transition.fast}, opacity ${transition.fast}`,
        width: fullWidth ? '100%' : undefined,
        ...v,
        ...s,
        ...style,
      }}
      {...rest}
    >
      {loading
        ? <Spinner size={size === 'lg' ? 14 : 12} />
        : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// IconButton -- square button for SVG-only actions
// ---------------------------------------------------------------------------
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children' | 'fullWidth'> {
  icon: React.ReactNode;
  /** Required for screen-readers since there's no text. */
  ariaLabel: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon, ariaLabel, size = 'md', variant = 'ghost', style, ...rest
}, ref) => {
  const dim = buttonTokens.height[size];
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      aria-label={ariaLabel}
      title={rest.title ?? ariaLabel}
      style={{
        width: dim,
        padding: 0,
        ...style,
      }}
      {...rest}
    >
      {icon}
    </Button>
  );
});
IconButton.displayName = 'IconButton';

// ---------------------------------------------------------------------------
// Spinner (used for loading state)
// ---------------------------------------------------------------------------
const Spinner: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
    style={{ animation: 'dexSpin 0.8s linear infinite' }}
  >
    <style>{`@keyframes dexSpin { to { transform: rotate(360deg); } }`}</style>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
