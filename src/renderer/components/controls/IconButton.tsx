// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// IconButton -- the shared, accent-aware square icon control for creative app
// toolbars (Axl, Prism, Flux, Vinx, Imosion, Forge) and the window chrome.
//
// The creative toolbars hand-rolled the same 24x24 `toolBtnStyle(active)` +
// `hoverHandlers(active)` pair dozens of times, each repeating the accent / idle
// / hover conditional styling. This is the single shared implementation, kept
// pixel-identical to that pattern so adoption is a zero-visual-change refactor.
// Renders a real <button> so the global `.dex-app-container button` focus/press
// CSS and `aria-pressed` styling keep applying.

import React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Glyph (typically an inline <svg>). */
  icon: React.ReactNode;
  /** Selected / toggled state -- paints the accent tint + underline. */
  active?: boolean;
  /** 24px (sm, default -- matches creative toolbars) or 28px (md). */
  size?: 'sm' | 'md';
  /** Per-app accent for the active state. Defaults to the DEX accent. */
  accentColor?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  active = false,
  size = 'sm',
  accentColor = 'var(--color-accent)',
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) => {
  const dim = size === 'sm' ? 24 : 28;
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onMouseEnter={(e) => {
        // Bare-button hover: subtle background only when not active/disabled.
        if (!active && !disabled) e.currentTarget.style.background = 'var(--color-bg-hover)';
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = 'transparent';
        onMouseLeave?.(e);
      }}
      style={{
        width: dim,
        height: dim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
        color: active ? accentColor : 'var(--color-text-secondary)',
        background: active ? `color-mix(in srgb, ${accentColor} 14%, transparent)` : 'transparent',
        boxShadow: active ? `inset 0 -1px 0 ${accentColor}` : 'none',
        ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  );
};

export default IconButton;
