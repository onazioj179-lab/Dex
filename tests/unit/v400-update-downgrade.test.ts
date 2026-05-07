// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  computeDowngradeEligibility,
  DOWNGRADE_WINDOW_DAYS,
  DOWNGRADE_WINDOW_MS,
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
});
