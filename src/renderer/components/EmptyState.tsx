// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * EmptyState - shared empty / no-results / first-run scaffold.
 *
 * Use this for any panel that renders zero items. Keeps tone, spacing,
 * and affordance consistent across every app instead of each surface
 * inventing its own empty illustration.
 */

import React, { memo } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  /** Short title, e.g. "No files yet". */
  title: string;
  /** Optional supporting line; keep under ~120 chars. */
  description?: string;
  /** Optional emoji-free icon (SVG path string already wrapped, or a node). */
  icon?: React.ReactNode;
  /** Up to two CTAs. First is primary. */
  actions?: EmptyStateAction[];
  /** Compact layout for sidebars / small panels. */
  compact?: boolean;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-8) var(--space-6)',
  color: 'var(--color-text-secondary)',
  minHeight: 160,
};

const compactStyle: React.CSSProperties = {
  ...baseStyle,
  padding: 'var(--space-4) var(--space-3)',
  gap: 'var(--space-2)',
  minHeight: 96,
};

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  margin: 0,
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
  maxWidth: 360,
};

const iconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-tertiary, var(--color-text-secondary))',
  opacity: 0.7,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginTop: 4,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const buttonBase: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'background 120ms ease, border-color 120ms ease',
};

function buttonStyle(variant: EmptyStateAction['variant']): React.CSSProperties {
  if (variant === 'secondary') {
    return {
      ...buttonBase,
      background: 'transparent',
      borderColor: 'var(--color-border-subtle)',
      color: 'var(--color-text-primary)',
    };
  }
  return {
    ...buttonBase,
    background: 'var(--color-accent, #4a8af4)',
    color: '#ffffff',
  };
}

export const EmptyState = memo<EmptyStateProps>(({
  title,
  description,
  icon,
  actions,
  compact = false,
  className,
  style,
}) => {
  const root: React.CSSProperties = { ...(compact ? compactStyle : baseStyle), ...style };

  return (
    <div className={className} style={root} role="status" aria-live="polite">
      {icon ? <div style={iconStyle} aria-hidden="true">{icon}</div> : null}
      <h3 style={titleStyle}>{title}</h3>
      {description ? <p style={descStyle}>{description}</p> : null}
      {actions && actions.length > 0 ? (
        <div style={actionRowStyle}>
          {actions.slice(0, 2).map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              style={buttonStyle(i === 0 ? (a.variant ?? 'primary') : (a.variant ?? 'secondary'))}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;
