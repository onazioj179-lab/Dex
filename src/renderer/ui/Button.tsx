// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Button + IconButton
// Single source of truth for clickable controls. Variants are derived from
// design tokens so every screen feels the same. No emojis: pass an SVG via
// `leftIcon` / `rightIcon`.
// ===========================================================================
import React, { forwardRef } from 'react';
import { space, radius, fontSize, fontWeight, button as buttonTokens } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';

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

// Variant colors and hover/active states live in CSS (design-tokens.css,
// `.dex-btn[data-variant=...]`). Driving them declaratively means states can
// never get stuck after a re-render mid-hover, themes apply instantly, and
// caller `style` overrides are never clobbered by mouse handlers.

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
  className,
  children,
  ...rest
}, ref) => {
  const isDisabled = disabled || loading;
  const s = sizeStyle(size);
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={isDisabled}
      className={className ? `dex-btn ${className}` : 'dex-btn'}
      data-variant={variant}
      data-size={size}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        opacity: isDisabled ? 0.55 : 1,
        // Pill: one button shape across DEX (owner 2026-11-24).
        borderRadius: radius.full,
        fontFamily: 'inherit',
        fontWeight: fontWeight.semibold,
        whiteSpace: 'nowrap',
        transition: cssTransitions(['background', 'color', 'border-color', 'opacity'], 'micro'),
        width: fullWidth ? '100%' : undefined,
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
