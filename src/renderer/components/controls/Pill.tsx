// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Pill -- the shared, accent-aware "cut-out" rounded action button (icon + an
// optional label) used across creative toolbars for Export / Feature / GD&T /
// AI-style actions. Encapsulates the repeated inline shape
// `{ ...toolBtnStyle(active), width:'auto', padding:'0 10px', borderRadius:9999 }`
// so it stays consistent everywhere. Renders a real <button> so global focus /
// press CSS and `aria-pressed` styling keep applying.

import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Optional leading glyph (typically an inline <svg>). */
  icon?: React.ReactNode;
  /** Selected / expanded state -- paints the accent tint. */
  active?: boolean;
  /** 24px (sm, default) or 28px (md) tall. */
  size?: 'sm' | 'md';
  /** Per-app accent for the active state. Defaults to the DEX accent. */
  accentColor?: string;
}

export const Pill: React.FC<PillProps> = ({
  icon,
  active = false,
  size = 'sm',
  accentColor = 'var(--color-accent)',
  children,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) => {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onMouseEnter={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = 'var(--color-bg-hover)';
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) e.currentTarget.style.background = 'transparent';
        onMouseLeave?.(e);
      }}
      style={{
        height: size === 'sm' ? 24 : 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '0 10px',
        borderRadius: 9999,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: active ? accentColor : 'var(--color-text-secondary)',
        background: active ? `color-mix(in srgb, ${accentColor} 14%, transparent)` : 'transparent',
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children != null && children !== false && <span style={{ whiteSpace: 'nowrap' }}>{children}</span>}
    </button>
  );
};

export default Pill;
