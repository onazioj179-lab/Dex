// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Badge
// Compact status pill: tone (neutral|info|success|warning|error|accent),
// size (sm|md), optional dot indicator.
// ===========================================================================
import React from 'react';
import { fontSize, fontWeight, radius, space } from '../styles/tokens';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'accent';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  dot?: boolean;
}

const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: {
    bg: 'var(--color-bg-hover, #1E1E22)',
    fg: 'var(--color-text-secondary, #B8B8BD)',
    border: 'var(--color-border-subtle, rgba(255,255,255,0.08))',
  },
  info: {
    bg: 'rgba(74,158,255,0.10)',
    fg: '#6CB2FF',
    border: 'rgba(74,158,255,0.30)',
  },
  success: {
    bg: 'rgba(52,199,89,0.10)',
    fg: '#34C759',
    border: 'rgba(52,199,89,0.30)',
  },
  warning: {
    bg: 'rgba(255,159,10,0.10)',
    fg: '#FF9F0A',
    border: 'rgba(255,159,10,0.30)',
  },
  error: {
    bg: 'rgba(255,69,58,0.10)',
    fg: '#FF6B61',
    border: 'rgba(255,69,58,0.30)',
  },
  accent: {
    bg: 'var(--color-accent, #4A9EFF)',
    fg: '#fff',
    border: 'transparent',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral', size = 'sm', dot = false, style, children, ...rest
}) => {
  const t = TONES[tone];
  const small = size === 'sm';
  return (
    <span
      data-tone={tone}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: space[1],
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        borderRadius: radius.full,
        padding: small ? '2px 8px' : '3px 10px',
        fontSize: small ? fontSize.xs : fontSize.sm,
        fontWeight: fontWeight.semibold,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: tone === 'accent' ? '#fff' : t.fg,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
};
