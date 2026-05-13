// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  RELEASE_RINGS,
  RING_GATES,
  IPC_RATE_BUDGETS,
  HEALTH_SCORE_BANDS,
  HEALTH_CRITICAL_WINDOWS_FOR_ROLLBACK,
  MEMORY_PRESSURE_THRESHOLDS,
  ATTENTION_BUDGET_DEFAULTS,
  NOTIFICATION_WEIGHTS,
  PERFORMANCE_BASELINES,
  RELIABILITY_BASELINES,
  canPromote,
  nextRing,
} from '../../src/shared/governance';

describe('governance constants', () => {
  it('release rings are ordered dev -> canary -> beta -> stable', () => {
    expect(RELEASE_RINGS).toEqual(['dev', 'canary', 'beta', 'stable']);
  });

  it('ring gates tighten monotonically by crash-free ratio', () => {
    const order = RELEASE_RINGS.map((r) => RING_GATES[r].crashFreeRatio);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
    }
  });

  it('ring gates tighten monotonically by dwell time', () => {
    const order = RELEASE_RINGS.map((r) => RING_GATES[r].minDwellMs);
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
    }
  });

  it('IPC rate budgets define interactive > background > bulk', () => {
    expect(IPC_RATE_BUDGETS.interactive.ratePerSecond!).toBeGreaterThan(
      IPC_RATE_BUDGETS.background.ratePerSecond!,
    );
    expect(IPC_RATE_BUDGETS.background.ratePerSecond!).toBeGreaterThan(
      IPC_RATE_BUDGETS.bulk.ratePerSecond!,
    );
    expect(IPC_RATE_BUDGETS.unbounded.ratePerSecond).toBeNull();
  });

  it('health score bands match the runtime computeHealthScore module', () => {
    expect(HEALTH_SCORE_BANDS.healthy).toBe(80);
    expect(HEALTH_SCORE_BANDS.degraded).toBe(60);
    expect(HEALTH_CRITICAL_WINDOWS_FOR_ROLLBACK).toBe(2);
  });

  it('memory pressure thresholds keep elevated < critical with hysteresis room', () => {
    expect(MEMORY_PRESSURE_THRESHOLDS.elevated).toBeLessThan(MEMORY_PRESSURE_THRESHOLDS.critical);
    expect(MEMORY_PRESSURE_THRESHOLDS.hysteresis).toBeGreaterThan(0);
    expect(MEMORY_PRESSURE_THRESHOLDS.hysteresis).toBeLessThan(
      MEMORY_PRESSURE_THRESHOLDS.critical - MEMORY_PRESSURE_THRESHOLDS.elevated,
    );
  });

  it('attention budget defaults are positive', () => {
    expect(ATTENTION_BUDGET_DEFAULTS.windowMs).toBeGreaterThan(0);
    expect(ATTENTION_BUDGET_DEFAULTS.maxInterruptions).toBeGreaterThan(0);
    expect(NOTIFICATION_WEIGHTS.critical).toBeGreaterThan(NOTIFICATION_WEIGHTS.info);
  });

  it('performance and reliability baselines are sane', () => {
    expect(PERFORMANCE_BASELINES.coldStartMs).toBeGreaterThan(0);
    expect(PERFORMANCE_BASELINES.frameP95IdleMs).toBeLessThan(
      PERFORMANCE_BASELINES.frameP95ActiveMs,
    );
    expect(RELIABILITY_BASELINES.crashFreeSessions24h).toBeGreaterThan(0.95);
  });

  it('canPromote enforces all three gate dimensions', () => {
    const observed = { crashFreeRatio: 1, updateRollbackSuccess: 1, dwellMs: Number.MAX_SAFE_INTEGER };
    expect(canPromote('dev', observed)).toBe(true);
    expect(canPromote('canary', observed)).toBe(true);
    expect(canPromote('canary', { crashFreeRatio: 0.5, updateRollbackSuccess: 1, dwellMs: 1e12 })).toBe(false);
    expect(canPromote('beta', { crashFreeRatio: 1, updateRollbackSuccess: 1, dwellMs: 0 })).toBe(false);
  });

  it('nextRing returns the downstream ring or null at stable', () => {
    expect(nextRing('dev')).toBe('canary');
    expect(nextRing('canary')).toBe('beta');
    expect(nextRing('beta')).toBe('stable');
    expect(nextRing('stable')).toBeNull();
  });
});
