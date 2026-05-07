// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ConfidenceChip - small pill showing low/medium/high confidence with the
 * numeric score on hover. Uses the pure `confidenceLabel` mapping from
 * `src/shared/uki/confidence.ts` so the threshold lives in one place.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React from 'react';
import { confidenceLabel, type ConfidenceLabel } from '../../../shared/uki/confidence';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

const TONE: Record<ConfidenceLabel, { fg: string; bg: string; label: string }> = {
  low: { fg: colors.semantic.error, bg: colors.semantic.errorMuted, label: 'Low confidence' },
  medium: { fg: colors.semantic.warning, bg: colors.semantic.warningMuted, label: 'Medium confidence' },
  high: { fg: colors.semantic.success, bg: colors.semantic.successMuted, label: 'High confidence' },
};

export interface ConfidenceChipProps {
  /** Score in [0, 1]. */
  score: number;
  /** Override label text. */
  label?: string;
  /** Render compact (icon only). */
  compact?: boolean;
}

export function ConfidenceChip({ score, label, compact = false }: ConfidenceChipProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  const lbl = confidenceLabel(clamped);
  const tone = TONE[lbl];
  const text = label ?? tone.label;
  const pct = Math.round(clamped * 100);
  return (
    <span
      role="status"
      aria-label={`${text} (${pct}%)`}
      title={`${text} - ${pct}%`}
      data-testid="confidence-chip"
      data-level={lbl}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[1],
        padding: `${space[1]}px ${space[2]}px`,
        borderRadius: radius.full,
        background: tone.bg,
        color: tone.fg,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <Dot color={tone.fg} />
      {!compact && <span>{text}</span>}
      {!compact && <span style={{ opacity: 0.7 }}>{pct}%</span>}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }}
    />
  );
}
