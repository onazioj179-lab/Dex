// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI token-budget tracker.
 *
 * Tracks the cumulative tokens charged against a plan window (daily,
 * minute, request) and signals when the user is over budget.
 */

// DEX v3.8.9 - UKI token budget

export interface BudgetState {
  used: number;
  limit: number;       // Infinity = unlimited
  windowStartedAt: number;
  windowMs: number;    // sliding window length
}

export function createBudget(limit: number, windowMs: number, now: number = Date.now()): BudgetState {
  return { used: 0, limit, windowStartedAt: now, windowMs };
}

export function chargeBudget(state: BudgetState, tokens: number, now: number = Date.now()): { state: BudgetState; ok: boolean; remaining: number } {
  const rolled = rollIfExpired(state, now);
  const next = { ...rolled, used: rolled.used + tokens };
  const ok = next.used <= next.limit;
  return { state: next, ok, remaining: Math.max(0, next.limit - next.used) };
}

export function remainingBudget(state: BudgetState, now: number = Date.now()): number {
  const rolled = rollIfExpired(state, now);
  return Math.max(0, rolled.limit - rolled.used);
}

export function rollIfExpired(state: BudgetState, now: number = Date.now()): BudgetState {
  if (now - state.windowStartedAt < state.windowMs) return state;
  return { ...state, used: 0, windowStartedAt: now };
}

export function budgetPercent(state: BudgetState, now: number = Date.now()): number {
  const rolled = rollIfExpired(state, now);
  if (!Number.isFinite(rolled.limit) || rolled.limit <= 0) return 0;
  return Math.min(100, Math.round((rolled.used / rolled.limit) * 100));
}
