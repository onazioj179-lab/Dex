// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Card
// Surface container with consistent radius/border/padding from tokens.
// Variants: default (subtle border), elevated (shadow), inset (recessed).
// ===========================================================================
import React, { forwardRef } from 'react';
import { space, radius } from '../styles/tokens';
import { cssTransitions } from '../utils/MotionController';

export type CardVariant = 'default' | 'elevated' | 'inset' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
  selected?: boolean;
}

const PAD: Record<CardPadding, number> = {
  none: 0,
  sm: space[3],
  md: space[4],
  lg: space[6],
};

const variantStyle = (v: CardVariant, selected: boolean): React.CSSProperties => {
  const ring = selected ? '0 0 0 1px var(--color-accent, #4A9EFF)' : undefined;
  switch (v) {
    case 'elevated':
      return {
        background: 'var(--color-bg-elevated, #1A1A1E)',
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        boxShadow: ring ?? 'var(--shadow-depth-2, 0 6px 16px rgba(0,0,0,0.30))',
      };
    case 'inset':
      return {
        background: 'var(--color-bg-inset, #101012)',
        border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
        boxShadow: ring,
      };
    case 'outline':
      return {
        background: 'transparent',
        border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
        boxShadow: ring,
      };
    case 'default':
    default:
      return {
        background: 'var(--color-bg-surface, #161618)',
        border: `1px solid ${selected ? 'var(--color-accent, #4A9EFF)' : 'var(--color-border-subtle, rgba(255,255,255,0.08))'}`,
        boxShadow: ring,
      };
  }
};

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = 'default',
  padding = 'md',
  interactive = false,
  selected = false,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}, ref) => {
  const v = variantStyle(variant, selected);
  return (
    <div
      ref={ref}
      data-card-variant={variant}
      data-card-interactive={interactive ? 'true' : 'false'}
      onMouseEnter={e => {
        if (interactive) (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover, #1E1E22)';
        onMouseEnter?.(e);
      }}
      onMouseLeave={e => {
        if (interactive) (e.currentTarget as HTMLElement).style.background = v.background as string;
        onMouseLeave?.(e);
      }}
      style={{
        borderRadius: radius.lg,
        padding: PAD[padding],
        cursor: interactive ? 'pointer' : 'default',
        transition: interactive ? cssTransitions(['background', 'border-color'], 'hover') : undefined,
        color: 'var(--color-text-primary, #fff)',
        ...v,
        ...style,
      }}
      {...rest}
    />
  );
});
Card.displayName = 'Card';

// ---------------------------------------------------------------------------
// CardHeader / CardBody / CardFooter -- optional structural slots
// ---------------------------------------------------------------------------
export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...rest }) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: space[3], marginBottom: space[3],
      ...style,
    }}
    {...rest}
  />
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...rest }) => (
  <div style={{ ...style }} {...rest} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...rest }) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      gap: space[2], marginTop: space[4],
      paddingTop: space[3],
      borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
      ...style,
    }}
    {...rest}
  />
);
