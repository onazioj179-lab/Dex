// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-provider preferred-model store + the global Smart Router routing goal.
 * Lets the user choose which model a configured provider should use (e.g. GPT-4o
 * vs GPT-4o mini) and how UKI should auto-route (Auto/Cheapest/Fastest/Smartest/
 * Offline). Plain localStorage — neither model ids nor the goal are secrets.
 * Pure + testable; the selection logic in `connect.ts` consults both.
 */

import type { RoutingGoal } from '../../../shared/uki/smartRouter';

const PREFIX = 'dex-uki-model-';
const ROUTING_GOAL_KEY = 'dex-uki-routing-goal';
const VALID_GOALS: readonly RoutingGoal[] = ['auto', 'cheapest', 'fastest', 'smartest', 'offline'];

export function getPreferredModel(providerId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + providerId);
  } catch {
    return null;
  }
}

export function setPreferredModel(providerId: string, modelId: string): void {
  try {
    if (!modelId) { clearPreferredModel(providerId); return; }
    localStorage.setItem(PREFIX + providerId, modelId);
  } catch { /* storage unavailable */ }
}

export function clearPreferredModel(providerId: string): void {
  try { localStorage.removeItem(PREFIX + providerId); } catch { /* */ }
}

/** The Smart Router goal UKI uses to auto-pick a model. Defaults to 'auto'. */
export function getRoutingGoal(): RoutingGoal {
  try {
    const v = localStorage.getItem(ROUTING_GOAL_KEY) as RoutingGoal | null;
    return v && VALID_GOALS.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setRoutingGoal(goal: RoutingGoal): void {
  try { localStorage.setItem(ROUTING_GOAL_KEY, goal); } catch { /* storage unavailable */ }
}
