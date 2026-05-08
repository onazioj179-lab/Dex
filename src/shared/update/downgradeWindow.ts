// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Pure helper: 30-day Pro downgrade window math.
//
// Policy (v4.0.1+):
//   - User may downgrade to at most MAX_DOWNGRADE_TARGETS (= 2) prior versions.
//   - Total install history retained on disk = current + 2 prior = 3 records.
//   - 30-day window starts the moment the current version was installed.
//   - When the window expires the prior-version list "clears" — only the
//     current install record is kept and downgrade becomes unavailable until
//     a new upgrade resets the window.
//   - Free users: never eligible. Pro / Team: eligible during the window.
//
// No Electron, no React — safe to unit test.

export const DOWNGRADE_WINDOW_DAYS = 30;
export const DOWNGRADE_WINDOW_MS = DOWNGRADE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Maximum number of prior versions a user may roll back to. */
export const MAX_DOWNGRADE_TARGETS = 2;

/** Total install records retained (current + MAX_DOWNGRADE_TARGETS). */
export const MAX_INSTALL_HISTORY = MAX_DOWNGRADE_TARGETS + 1;

export type LicenseTier = 'free' | 'pro' | 'team';

export interface DowngradeEligibility {
  eligible: boolean;
  daysRemaining: number;
  /** Most-recent prior version (back-compat single-target field). */
  targetVersion: string | null;
  /** All versions the user may roll back to (most recent first, max 2). */
  targetVersions: string[];
  reason: string;
}

export interface InstallRecord {
  version: string;
  fromVersion: string | null;
  installedAt: number;
}

/**
 * Compute downgrade eligibility for the current install.
 *
 * @param installRecord The most-recent install record (current version).
 * @param tier          License tier of the user.
 * @param now           Current timestamp (injectable for tests).
 * @param history       Optional full install history (oldest-first). When
 *                      omitted the legacy single-target shape is used,
 *                      derived from `installRecord.fromVersion`.
 */
export function computeDowngradeEligibility(
  installRecord: InstallRecord | null,
  tier: LicenseTier,
  now: number = Date.now(),
  history: InstallRecord[] = []
): DowngradeEligibility {
  if (!installRecord) {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: null,
      targetVersions: [],
      reason: 'No previous version recorded for this install.',
    };
  }

  const targetVersions = collectTargetVersions(installRecord, history);
  const primary = targetVersions[0] ?? null;

  if (targetVersions.length === 0) {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: null,
      targetVersions: [],
      reason: 'No previous version recorded for this install.',
    };
  }

  if (tier === 'free') {
    return {
      eligible: false,
      daysRemaining: 0,
      targetVersion: primary,
      targetVersions,
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
      targetVersion: primary,
      targetVersions,
      reason: `Downgrade window expired. You had ${DOWNGRADE_WINDOW_DAYS} days from install to roll back.`,
    };
  }

  const versionLabel = targetVersions.length > 1
    ? `one of ${targetVersions.length} prior versions`
    : `v${primary}`;

  return {
    eligible: true,
    daysRemaining,
    targetVersion: primary,
    targetVersions,
    reason: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining to downgrade to ${versionLabel}.`,
  };
}

function collectTargetVersions(
  current: InstallRecord,
  history: InstallRecord[]
): string[] {
  const seen = new Set<string>([current.version]);
  const targets: string[] = [];

  // Walk history newest -> oldest. Skip the current record itself.
  for (let i = history.length - 1; i >= 0 && targets.length < MAX_DOWNGRADE_TARGETS; i--) {
    const record = history[i];
    if (!record || !record.version) continue;
    if (record.installedAt > current.installedAt) continue; // ignore future entries
    if (record.version === current.version) continue;
    if (seen.has(record.version)) continue;
    seen.add(record.version);
    targets.push(record.version);
  }

  // Legacy fallback: when no history is supplied, derive a single target from
  // installRecord.fromVersion so existing callers keep working.
  if (targets.length === 0 && current.fromVersion && current.fromVersion !== current.version) {
    targets.push(current.fromVersion);
  }

  return targets;
}

/**
 * Prune install history per policy:
 *   - When the 30-day window has elapsed for the current version, clear all
 *     prior entries (keep only the current install record).
 *   - Otherwise keep at most MAX_INSTALL_HISTORY entries (newest wins).
 * Returns a new oldest-first array; does not mutate input.
 */
export function pruneInstallHistory(
  history: InstallRecord[],
  now: number = Date.now()
): InstallRecord[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const sorted = [...history]
    .filter((r) => r && typeof r.version === 'string' && typeof r.installedAt === 'number')
    .sort((a, b) => a.installedAt - b.installedAt);
  if (sorted.length === 0) return [];

  const current = sorted[sorted.length - 1];

  // Window expired relative to "now" => clear history down to current only.
  if (now - current.installedAt > DOWNGRADE_WINDOW_MS) {
    return [current];
  }

  // Cap retention to current + MAX_DOWNGRADE_TARGETS (keep newest entries).
  if (sorted.length > MAX_INSTALL_HISTORY) {
    return sorted.slice(sorted.length - MAX_INSTALL_HISTORY);
  }
  return sorted;
}
