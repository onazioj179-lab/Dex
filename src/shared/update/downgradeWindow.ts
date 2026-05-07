// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pure helper: 30-day Pro downgrade window math.
// No Electron, no React — safe to unit test.

export const DOWNGRADE_WINDOW_DAYS = 30;
export const DOWNGRADE_WINDOW_MS = DOWNGRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type LicenseTier = 'free' | 'pro' | 'team';

export interface DowngradeEligibility {
  eligible: boolean;
  daysRemaining: number;
  targetVersion: string | null;
  reason: string;
}

export interface InstallRecord {
  version: string;
  fromVersion: string | null;
  installedAt: number;
}

/**
 * Compute whether the user can downgrade from the current version to the
 * previous one. Pro and Team users get a 30-day rollback window from the
 * moment the current version was installed. Free users get nothing.
 */
export function computeDowngradeEligibility(
  installRecord: InstallRecord | null,
  tier: LicenseTier,
  now: number = Date.now()
): DowngradeEligibility {
  if (!installRecord || !installRecord.fromVersion) {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: null,
      reason: 'No previous version recorded for this install.',
    };
  }

  if (tier === 'free') {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: installRecord.fromVersion,
      reason: 'Downgrade is a Pro feature. Upgrade to roll back to a previous version.',
    };
  }

  const elapsed = Math.max(0, now - installRecord.installedAt);
  const remainingMs = DOWNGRADE_WINDOW_MS - elapsed;
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  if (remainingMs <= 0) {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: installRecord.fromVersion,
      reason: `Downgrade window expired. You had ${DOWNGRADE_WINDOW_DAYS} days from install to roll back.`,
    };
  }

  return {
    eligible: true,
    daysRemaining,
    targetVersion: installRecord.fromVersion,
    reason: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining to downgrade to v${installRecord.fromVersion}.`,
  };
}
