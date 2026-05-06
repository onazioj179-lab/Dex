// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ProgressRing -- accessible, animated SVG ring indicator.
 *
 * Used for encode progress (Forge), upload/download (Transfers),
 * task completion percentages (Tasks), and AI generation progress.
 *
 * W8#402: consistent progress indicators
 */

import React from 'react';

export interface ProgressRingProps {
  /** 0–100. */
  value: number;
  /** Ring outer diameter in px. Default 40. */
  size?: number;
  /** Stroke width in px. Default 3. */
  strokeWidth?: number;
  /** Color of the progress arc. Defaults to accent. */
  color?: string;
  /** Background track color. */
  trackColor?: string;
  /** Label shown below the ring (optional). */
  label?: string;
  /** Show numeric value in center. Default true. */
  showValue?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 40,
  strokeWidth = 3,
  color = 'var(--pg-accent, #6366f1)',
  trackColor = 'rgba(255,255,255,0.08)',
  label,
  showValue = true,
  className,
  style,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clampedValue / 100) * circumference;
  const gap = circumference - dash;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, ...style }}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ? `${label}: ${clampedValue}%` : `${clampedValue}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {/* Progress */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
        />
      </svg>
      {showValue && (
        <span style={{ fontSize: size * 0.2, color: 'var(--pg-text-primary)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {clampedValue}%
        </span>
      )}
      {label && (
        <span style={{ fontSize: size * 0.17, color: 'var(--pg-text-secondary)', textAlign: 'center', maxWidth: size * 2 }}>{label}</span>
      )}
    </span>
  );
};

export default ProgressRing;
