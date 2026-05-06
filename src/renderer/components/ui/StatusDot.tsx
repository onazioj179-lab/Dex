// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * StatusDot -- semantic status indicator component.
 *
 * Used throughout DEX for app lifecycle state, connection state,
 * service health, and task status. Supports pulse animation for active
 * states. Color is driven exclusively by semantic tokens, never raw values.
 *
 * W8#387: consistent status indicators
 */

import React from 'react';

export type DotStatus =
  | 'online'
  | 'offline'
  | 'idle'
  | 'busy'
  | 'error'
  | 'warning'
  | 'unknown';

const DOT_COLORS: Record<DotStatus, string> = {
  online: 'var(--status-online, #22c55e)',
  offline: 'var(--pg-text-tertiary, rgba(255,255,255,0.25))',
  idle: 'var(--status-idle, #f59e0b)',
  busy: 'var(--status-busy, #3b82f6)',
  error: 'var(--status-error, #ef4444)',
  warning: 'var(--status-warning, #f59e0b)',
  unknown: 'var(--pg-text-tertiary, rgba(255,255,255,0.25))',
};

const DOT_LABELS: Record<DotStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  idle: 'Idle',
  busy: 'Busy',
  error: 'Error',
  warning: 'Warning',
  unknown: 'Unknown',
};

const PULSE_STATUSES = new Set<DotStatus>(['online', 'busy', 'error']);

export interface StatusDotProps {
  status: DotStatus;
  /** Size in px. Default 8. */
  size?: number;
  /** Show pulse ring animation. Auto-enabled for online/busy/error. */
  pulse?: boolean;
  /** Custom aria-label. Defaults to DOT_LABELS[status]. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 8,
  pulse,
  label,
  className,
  style,
}) => {
  const shouldPulse = pulse ?? PULSE_STATUSES.has(status);
  const color = DOT_COLORS[status];
  const ariaLabel = label ?? DOT_LABELS[status];

  return (
    <span
      className={`dex-status-dot${shouldPulse ? ' dex-status-dot--pulse' : ''}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={ariaLabel}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        position: 'relative',
        ...style,
      }}
    >
      {shouldPulse && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            border: `1.5px solid ${color}`,
            animation: 'dex-dot-pulse 2s ease-out infinite',
            opacity: 0,
          }}
        />
      )}
    </span>
  );
};

export default StatusDot;
