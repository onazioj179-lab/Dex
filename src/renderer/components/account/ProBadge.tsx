// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ProBadge -- a small inline pill that marks a feature as Pro / paid.
 * UpgradePrompt -- a card listing locked perks with a Compare Plans CTA.
 */

// DEX v3.8.9 - pro badge + upgrade prompt UI

import React from 'react';
import { space, radius, fontSize } from '../../styles/tokens';
import { Button } from '../../ui/Button';
import { lockedPerks, checkPerk, type PerkGate } from '../../../shared/license/proPerks';
import type { PlanId } from '../../../shared/license/pricing';

export interface ProBadgeProps {
  gate: PerkGate;
  currentPlan: PlanId;
  /** Renders nothing if the user already has access. */
  hideWhenUnlocked?: boolean;
}

export function ProBadge({ gate, currentPlan, hideWhenUnlocked = true }: ProBadgeProps) {
  const result = checkPerk({ currentPlan, gate });
  if (result.allowed && hideWhenUnlocked) return null;
  const label = result.upgradeTo === 'studio' ? 'Studio' : result.upgradeTo === 'pro' ? 'Pro' : 'Paid';
  return (
    <span
      title={result.perk.headline}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        background: 'linear-gradient(135deg, #4A9EFF 0%, #8B5CF6 100%)',
        color: '#fff',
        fontSize: fontSize.xs,
        fontWeight: 600,
        borderRadius: radius.full,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
      }}
    >{label}</span>
  );
}

export interface UpgradePromptProps {
  currentPlan: PlanId;
  onCompare?(): void;
  onDismiss?(): void;
  /** Limit perks shown. Default 4. */
  limit?: number;
}

export function UpgradePrompt({ currentPlan, onCompare, onDismiss, limit = 4 }: UpgradePromptProps) {
  const perks = lockedPerks(currentPlan).slice(0, limit);
  if (perks.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Upgrade DEX"
      style={{
        background: 'var(--color-bg-elevated, #1A1A1E)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
        borderRadius: radius.lg,
        padding: space[5],
        display: 'flex',
        flexDirection: 'column',
        gap: space[3],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600 }}>Unlock more in DEX</h3>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss">Dismiss</Button>
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {perks.map((p) => (
          <li key={p.gate} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: fontSize.sm, fontWeight: 600 }}>{p.headline}</span>
            <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', lineHeight: 1.4 }}>{p.blurb}</span>
          </li>
        ))}
      </ul>
      {onCompare && (
        <Button variant="primary" size="md" onClick={onCompare} fullWidth>Compare plans</Button>
      )}
    </div>
  );
}
