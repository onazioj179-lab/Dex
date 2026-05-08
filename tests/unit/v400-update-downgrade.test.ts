// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  computeDowngradeEligibility,
  pruneInstallHistory,
  DOWNGRADE_WINDOW_DAYS,
  DOWNGRADE_WINDOW_MS,
  MAX_DOWNGRADE_TARGETS,
  MAX_INSTALL_HISTORY,
} from '../../src/shared/update/downgradeWindow';

const DAY = 24 * 60 * 60 * 1000;

describe('computeDowngradeEligibility', () => {
  const baseRecord = {
    version: '4.0.0',
    fromVersion: '3.6.0',
    installedAt: 1_700_000_000_000,
  };

  it('blocks free users regardless of timing', () => {
    const result = computeDowngradeEligibility(baseRecord, 'free', baseRecord.installedAt + DAY);
    expect(result.eligible).toBe(false);
    expect(result.daysRemaining).toBe(0);
    expect(result.targetVersion).toBe('3.6.0');
    expect(result.reason).toMatch(/Pro/);
  });

  it('allows pro users within 30 days', () => {
    const result = computeDowngradeEligibility(baseRecord, 'pro', baseRecord.installedAt + DAY);
    expect(result.eligible).toBe(true);
    expect(result.daysRemaining).toBe(DOWNGRADE_WINDOW_DAYS - 1);
    expect(result.targetVersion).toBe('3.6.0');
  });

  it('allows team users on day 0', () => {
    const result = computeDowngradeEligibility(baseRecord, 'team', baseRecord.installedAt);
    expect(result.eligible).toBe(true);
    expect(result.daysRemaining).toBe(DOWNGRADE_WINDOW_DAYS);
  });

  it('blocks pro users after 30 days', () => {
    const result = computeDowngradeEligibility(
      baseRecord,
      'pro',
      baseRecord.installedAt + DOWNGRADE_WINDOW_MS + 1
    );
    expect(result.eligible).toBe(false);
    expect(result.daysRemaining).toBe(0);
    expect(result.reason).toMatch(/expired/i);
  });

  it('reports zero remaining at exactly the boundary', () => {
    const result = computeDowngradeEligibility(
      baseRecord,
      'pro',
      baseRecord.installedAt + DOWNGRADE_WINDOW_MS
    );
    expect(result.eligible).toBe(false);
    expect(result.daysRemaining).toBe(0);
  });

  it('returns ineligible when no previous version exists', () => {
    const fresh = { version: '4.0.0', fromVersion: null, installedAt: 1_700_000_000_000 };
    const result = computeDowngradeEligibility(fresh, 'pro', fresh.installedAt + DAY);
    expect(result.eligible).toBe(false);
    expect(result.targetVersion).toBeNull();
    expect(result.reason).toMatch(/no previous/i);
  });

  it('returns ineligible when no install record at all', () => {
    const result = computeDowngradeEligibility(null, 'pro', Date.now());
    expect(result.eligible).toBe(false);
    expect(result.targetVersion).toBeNull();
  });

  it('day count rounds up so user always sees at least 1 until expiry', () => {
    const almostExpired = computeDowngradeEligibility(
      baseRecord,
      'pro',
      baseRecord.installedAt + DOWNGRADE_WINDOW_MS - 1000
    );
    expect(almostExpired.eligible).toBe(true);
    expect(almostExpired.daysRemaining).toBeGreaterThanOrEqual(1);
  });

  it('exposes targetVersions list (legacy single-target fallback)', () => {
    const result = computeDowngradeEligibility(baseRecord, 'pro', baseRecord.installedAt + DAY);
    expect(result.targetVersions).toEqual(['3.6.0']);
  });

  it('returns up to MAX_DOWNGRADE_TARGETS prior versions when history is supplied', () => {
    const history = [
      { version: '3.5.0', fromVersion: null, installedAt: baseRecord.installedAt - 3 * DAY },
      { version: '3.6.0', fromVersion: '3.5.0', installedAt: baseRecord.installedAt - 2 * DAY },
      { version: '3.7.0', fromVersion: '3.6.0', installedAt: baseRecord.installedAt - DAY },
      { ...baseRecord, fromVersion: '3.7.0' },
    ];
    const result = computeDowngradeEligibility(history[history.length - 1], 'pro', baseRecord.installedAt + DAY, history);
    expect(result.eligible).toBe(true);
    expect(result.targetVersions).toEqual(['3.7.0', '3.6.0']);
    expect(result.targetVersions.length).toBeLessThanOrEqual(MAX_DOWNGRADE_TARGETS);
    expect(result.targetVersion).toBe('3.7.0');
  });
});

describe('pruneInstallHistory', () => {
  const t0 = 1_700_000_000_000;

  it('returns empty for empty input', () => {
    expect(pruneInstallHistory([])).toEqual([]);
  });

  it('caps retention to MAX_INSTALL_HISTORY (current + 2 prior)', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      version: `1.0.${i}`,
      fromVersion: i === 0 ? null : `1.0.${i - 1}`,
      installedAt: t0 + i * DAY,
    }));
    const pruned = pruneInstallHistory(history, t0 + 6 * DAY);
    expect(pruned.length).toBe(MAX_INSTALL_HISTORY);
    expect(pruned[pruned.length - 1].version).toBe('1.0.5');
    expect(pruned[0].version).toBe('1.0.3');
  });

  it('clears prior history once the 30-day window has elapsed', () => {
    const history = [
      { version: '1.0.0', fromVersion: null, installedAt: t0 },
      { version: '1.1.0', fromVersion: '1.0.0', installedAt: t0 + DAY },
      { version: '1.2.0', fromVersion: '1.1.0', installedAt: t0 + 2 * DAY },
    ];
    const pruned = pruneInstallHistory(history, t0 + 2 * DAY + DOWNGRADE_WINDOW_MS + 1);
    expect(pruned.length).toBe(1);
    expect(pruned[0].version).toBe('1.2.0');
  });

  it('keeps history within window when under cap', () => {
    const history = [
      { version: '1.0.0', fromVersion: null, installedAt: t0 },
      { version: '1.1.0', fromVersion: '1.0.0', installedAt: t0 + DAY },
    ];
    const pruned = pruneInstallHistory(history, t0 + DAY + DAY);
    expect(pruned.length).toBe(2);
  });
});
