// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ErrorState - shared error display panel.
 *
 * Use inside an ErrorBoundary fallback or for non-fatal load failures
 * (network, IPC, file-system) so every app surfaces failure with the
 * same tone and recovery affordance.
 */

import React, { memo } from 'react';

export interface ErrorStateProps {
  /** Short human-readable title. */
  title?: string;
  /** Longer description (raw error text or plain English). */
  message?: string;
  /** Retry handler. If provided, a Retry button renders. */
  onRetry?: () => void;
  /** Additional secondary action (e.g. "Report"). */
  onSecondary?: () => void;
  /** Label for secondary action. */
  secondaryLabel?: string;
  /** Compact layout. */
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '32px 24px',
  textAlign: 'center',
  color: 'var(--color-text-secondary)',
  minHeight: 160,
};

const compactStyle: React.CSSProperties = {
  ...baseStyle,
  padding: '16px 12px',
  gap: 8,
  minHeight: 96,
};

const iconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  color: 'var(--color-danger, #e5484d)',
  opacity: 0.9,
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  margin: 0,
};

const messageStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
  maxWidth: 420,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: 4,
};

const buttonBase: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
};

const primaryButton: React.CSSProperties = {
  ...buttonBase,
  background: 'var(--color-accent, #4a8af4)',
  color: '#ffffff',
};

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  borderColor: 'var(--color-border-subtle)',
  color: 'var(--color-text-primary)',
};

export const ErrorState = memo<ErrorStateProps>(({
  title = 'Something went wrong',
  message,
  onRetry,
  onSecondary,
  secondaryLabel = 'Report',
  compact = false,
  className,
  style,
}) => {
  const root: React.CSSProperties = { ...(compact ? compactStyle : baseStyle), ...style };

  return (
    <div className={className} style={root} role="alert" aria-live="assertive">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle} aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="0.75" fill="currentColor" stroke="none" />
      </svg>
      <h3 style={titleStyle}>{title}</h3>
      {message ? <p style={messageStyle}>{message}</p> : null}
      {(onRetry || onSecondary) ? (
        <div style={actionsStyle}>
          {onRetry ? (
            <button type="button" onClick={onRetry} style={primaryButton}>Retry</button>
          ) : null}
          {onSecondary ? (
            <button type="button" onClick={onSecondary} style={secondaryButton}>{secondaryLabel}</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ErrorState.displayName = 'ErrorState';

export default ErrorState;
