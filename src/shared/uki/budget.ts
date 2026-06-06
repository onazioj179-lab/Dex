// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI budget guard (ROADMAP-600 §1.A #010 cost budget, #011 latency budget,
 * #021 token/usage meter). Pure accounting of cost ($), latency (ms) and tokens
 * against per-task caps, so the agent loop can stop or degrade when a cap is
 * hit. No I/O — callers charge actuals after each model/tool call.
 */

// DEX v6.0 — UKI budget guard

export interface Budget {
  maxCostUsd?: number;
  maxLatencyMs?: number;
  maxTokens?: number;
}

export interface BudgetState {
  costUsd: number;
  latencyMs: number;
  tokens: number;
}

export type BudgetDimension = 'cost' | 'latency' | 'tokens';

export function newBudgetState(): BudgetState {
  return { costUsd: 0, latencyMs: 0, tokens: 0 };
}

/** Add a delta (any subset of dimensions) onto the running state. */
export function charge(state: BudgetState, delta: Partial<BudgetState>): BudgetState {
  return {
    costUsd: state.costUsd + (delta.costUsd ?? 0),
    latencyMs: state.latencyMs + (delta.latencyMs ?? 0),
    tokens: state.tokens + (delta.tokens ?? 0),
  };
}

export interface BudgetCheck {
  ok: boolean;
  exceeded: BudgetDimension[];
}

/** Which dimensions (if any) have exceeded their cap. */
export function checkBudget(state: BudgetState, budget: Budget): BudgetCheck {
  const exceeded: BudgetDimension[] = [];
  if (budget.maxCostUsd != null && state.costUsd > budget.maxCostUsd) exceeded.push('cost');
  if (budget.maxLatencyMs != null && state.latencyMs > budget.maxLatencyMs) exceeded.push('latency');
  if (budget.maxTokens != null && state.tokens > budget.maxTokens) exceeded.push('tokens');
  return { ok: exceeded.length === 0, exceeded };
}

/** True if applying `delta` now would push any dimension over its cap. */
export function wouldExceed(state: BudgetState, budget: Budget, delta: Partial<BudgetState>): boolean {
  return !checkBudget(charge(state, delta), budget).ok;
}

/** Remaining headroom per dimension (Infinity where uncapped). */
export function remaining(state: BudgetState, budget: Budget): BudgetState {
  return {
    costUsd: budget.maxCostUsd != null ? Math.max(0, budget.maxCostUsd - state.costUsd) : Infinity,
    latencyMs: budget.maxLatencyMs != null ? Math.max(0, budget.maxLatencyMs - state.latencyMs) : Infinity,
    tokens: budget.maxTokens != null ? Math.max(0, budget.maxTokens - state.tokens) : Infinity,
  };
}
