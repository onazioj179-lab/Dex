// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { deriveWorkloadPolicy, getWorkloadStatus } from '../../src/renderer/services/WorkloadGovernor';

describe('WorkloadGovernor.deriveWorkloadPolicy', () => {
  it('returns minimal under thermal-critical or low tier', () => {
    expect(deriveWorkloadPolicy({ perfTier: 'high', thermalState: 'critical', hidden: false })).toBe('minimal');
    expect(deriveWorkloadPolicy({ perfTier: 'low', thermalState: 'normal', hidden: false })).toBe('minimal');
  });

  it('returns reduced when warm/hot, mid tier, or backgrounded', () => {
    expect(deriveWorkloadPolicy({ perfTier: 'high', thermalState: 'hot', hidden: false })).toBe('reduced');
    expect(deriveWorkloadPolicy({ perfTier: 'high', thermalState: 'warm', hidden: false })).toBe('reduced');
    expect(deriveWorkloadPolicy({ perfTier: 'mid', thermalState: 'normal', hidden: false })).toBe('reduced');
    expect(deriveWorkloadPolicy({ perfTier: 'ultra', thermalState: 'normal', hidden: true })).toBe('reduced');
  });

  it('returns full only with headroom and a visible window', () => {
    expect(deriveWorkloadPolicy({ perfTier: 'high', thermalState: 'normal', hidden: false })).toBe('full');
    expect(deriveWorkloadPolicy({ perfTier: 'ultra', thermalState: 'unknown', hidden: false })).toBe('full');
  });

  it('getWorkloadStatus returns a coherent status from the DOM', () => {
    const s = getWorkloadStatus();
    expect(['full', 'reduced', 'minimal']).toContain(s.policy);
    expect(s.summary.length).toBeGreaterThan(0);
  });
});
