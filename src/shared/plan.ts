// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * Plan tier resolution.
 *
 * Two tiers:
 *   - 'free'  default. Conservative budgets sized for steady multi-app use.
 *   - 'power' creator-unlocked tier. Wider context windows, larger token
 *             ceilings, more concurrent tool calls. Driven entirely from
 *             the Creator Access surface — there is no purchase flow.
 *
 * Pure logic. No IPC, no DOM. Renderer reads the active tier via
 * `dexNative.creator.current()` and passes it to the helpers below.
 */

export type PlanTier = 'free' | 'power';

export interface PlanLimits {
  /** Tokens per minute for UKI streaming. */
  tokensPerMinute: number;
  /** Tokens per day for UKI streaming. */
  tokensPerDay: number;
  /** Max prompt context window size in tokens. */
  contextWindowTokens: number;
  /** Max parallel UKI tool calls per plan. */
  maxParallelToolCalls: number;
  /** Max plan steps per UKI run. */
  maxPlanSteps: number;
  /** Web fetch budget per UKI run. */
  webFetchesPerRun: number;
  /** Embedding cache entries (LRU size). */
  embeddingCacheEntries: number;
  /** Reader summary max sentences. */
  readerSummaryMaxSentences: number;
}

export const FREE_LIMITS: PlanLimits = {
  tokensPerMinute: 8_000,
  tokensPerDay: 200_000,
  contextWindowTokens: 8_000,
  maxParallelToolCalls: 2,
  maxPlanSteps: 12,
  webFetchesPerRun: 4,
  embeddingCacheEntries: 512,
  readerSummaryMaxSentences: 6,
};

export const POWER_LIMITS: PlanLimits = {
  tokensPerMinute: 60_000,
  tokensPerDay: 4_000_000,
  contextWindowTokens: 128_000,
  maxParallelToolCalls: 8,
  maxPlanSteps: 64,
  webFetchesPerRun: 32,
  embeddingCacheEntries: 8_192,
  readerSummaryMaxSentences: 24,
};

export function limitsFor(tier: PlanTier): PlanLimits {
  return tier === 'power' ? POWER_LIMITS : FREE_LIMITS;
}

/**
 * Resolve the active plan tier from a creator-access state object.
 * `creatorState` is the shape returned by the IPC channel `creator:current`.
 */
export function resolvePlan(creatorState: { unlocked?: boolean; expiresAt?: number | null } | null | undefined, now: number = Date.now()): PlanTier {
  if (!creatorState || !creatorState.unlocked) return 'free';
  const exp = creatorState.expiresAt;
  if (typeof exp === 'number' && exp > 0 && exp * 1000 < now) return 'free';
  return 'power';
}

export function planLabel(tier: PlanTier): string {
  return tier === 'power' ? 'Power (Creator)' : 'Free';
}
