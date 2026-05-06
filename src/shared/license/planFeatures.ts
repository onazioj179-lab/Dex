// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-plan feature & rate-limit map for smart UKI
 * -----------------------------------------------------------------------------
 * The user-mandated rule: Smart UKI works for everyone, but the *amount* of
 * smart it does scales with the plan. Free Viewer gets a small daily budget
 * and basic suggestions. Personal/Family get more, Pro gets a lot, Studio
 * gets pooled team caps. Hard limits are tokens-per-day; soft hints throttle
 * model temperature + parallelism.
 *
 * This module is the single source of truth so renderer banners and the
 * server-side rate limiter agree.
 */

// DEX v3.8.8 - plan-aware UKI features

import type { PlanId } from './pricing';
import type { RateLimitConfig } from '../security/rateLimit';

export interface PlanFeatures {
  /** Daily UKI plan executions allowed. */
  ukiDailyPlans: number;
  /** Concurrent UKI tool calls allowed. */
  ukiConcurrency: number;
  /** Allowed model tier: 'small' | 'standard' | 'pro'. */
  modelTier: 'small' | 'standard' | 'pro';
  /** Live collab seat count. */
  collabSeats: number;
  /** Cloud storage tier in bytes (mirrors quota.ts). */
  storageBytes: number;
  /** Per-account UKI plan rate-limit override (overrides the default LIMITS). */
  ukiRateLimit: RateLimitConfig;
}

const ONE_GB = 1024 * 1024 * 1024;

export const PLAN_FEATURES: Record<PlanId, PlanFeatures> = {
  'free-viewer': {
    ukiDailyPlans: 20,
    ukiConcurrency: 1,
    modelTier: 'small',
    collabSeats: 0,
    storageBytes: 10 * ONE_GB,
    ukiRateLimit: { capacity: 5, refillPerMs: 5 / 60_000 },        // 5 / min
  },
  personal: {
    ukiDailyPlans: 200,
    ukiConcurrency: 2,
    modelTier: 'standard',
    collabSeats: 1,
    storageBytes: 50 * ONE_GB,
    ukiRateLimit: { capacity: 30, refillPerMs: 30 / 60_000 },      // 30 / min
  },
  family: {
    ukiDailyPlans: 600,                                            // pooled
    ukiConcurrency: 3,
    modelTier: 'standard',
    collabSeats: 5,
    storageBytes: 50 * ONE_GB,
    ukiRateLimit: { capacity: 60, refillPerMs: 60 / 60_000 },
  },
  pro: {
    ukiDailyPlans: 1000,
    ukiConcurrency: 4,
    modelTier: 'pro',
    collabSeats: 3,
    storageBytes: 50 * ONE_GB,
    ukiRateLimit: { capacity: 120, refillPerMs: 120 / 60_000 },
  },
  studio: {
    ukiDailyPlans: 2000,                                           // per seat
    ukiConcurrency: 6,
    modelTier: 'pro',
    collabSeats: 99,
    storageBytes: 50 * ONE_GB,                                     // per seat
    ukiRateLimit: { capacity: 240, refillPerMs: 240 / 60_000 },
  },
};

export function featuresFor(planId: PlanId): PlanFeatures {
  return PLAN_FEATURES[planId];
}

export interface UkiUsage { plansToday: number; }

export interface UkiAllowance {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
  reason?: 'over-daily-cap';
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function checkUkiAllowance(planId: PlanId, usage: UkiUsage, now: number = Date.now()): UkiAllowance {
  const f = featuresFor(planId);
  const remaining = Math.max(0, f.ukiDailyPlans - usage.plansToday);
  const startOfDay = Math.floor(now / DAY_MS) * DAY_MS;
  const resetInMs = startOfDay + DAY_MS - now;
  if (remaining <= 0) return { allowed: false, remaining: 0, resetInMs, reason: 'over-daily-cap' };
  return { allowed: true, remaining, resetInMs };
}
