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

// Restrained colour (owner direction): no green "success" pills or tinted
// warning badges. Every tone is the same quiet neutral chip; warning and error
// only tint the TEXT, because there the colour carries meaning. Accent stays
// the one filled (DEX Blue) badge.
const NEUTRAL = {
  bg: 'rgba(255,255,255,0.06)',
  fg: 'var(--color-text-secondary, #B8B8BD)',
  border: 'transparent',
};
const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  neutral: NEUTRAL,
  info: NEUTRAL,
  success: NEUTRAL,
  warning: { ...NEUTRAL, fg: '#FF9F0A' },
  error: { ...NEUTRAL, fg: '#FF6B61' },
  accent: {
    bg: 'var(--color-accent, #0A84FF)',
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
