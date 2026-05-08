// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * StatusBar - shared bottom-edge status strip for app surfaces.
 *
 * Three slots (left/center/right). Pages and apps that previously rolled
 * their own status footer should consume this so spacing, typography,
 * and motion-reduced color shifts stay consistent.
 */

import React, { memo } from 'react';

export interface StatusBarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  /** Optional ARIA label, default "Status". */
  ariaLabel?: string;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: React.CSSProperties;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '4px 12px',
  minHeight: 24,
  fontSize: 11,
  color: 'var(--color-text-secondary)',
  background: 'var(--color-surface-2, var(--color-surface))',
  borderTop: '1px solid var(--color-border-subtle)',
  userSelect: 'none',
  flexShrink: 0,
};

const slotStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const centerStyle: React.CSSProperties = {
  ...slotStyle,
  flex: '1 1 auto',
  justifyContent: 'center',
};

export const StatusBar = memo<StatusBarProps>(({
  left,
  center,
  right,
  ariaLabel = 'Status',
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{ ...rootStyle, ...style }}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <div style={slotStyle}>{left}</div>
      <div style={centerStyle}>{center}</div>
      <div style={{ ...slotStyle, justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';

export default StatusBar;
