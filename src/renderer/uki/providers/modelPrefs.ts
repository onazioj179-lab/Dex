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
import {
  isProcessingMode, REASONING_PREFERENCES,
  type ProcessingMode, type ReasoningPreference,
} from '../../../shared/uki/assistantPolicy';

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

// ---- Processing mode (privacy boundary) + reasoning preference ---------------
// See shared/uki/assistantPolicy.ts. Enforced in orchestrator.chat() and the
// streaming path, so these are not just routing hints.

const PROCESSING_MODE_KEY = 'dex-uki-processing-mode';
const MANUAL_MODEL_KEY = 'dex-uki-manual-model';
const REASONING_KEY = 'dex-uki-reasoning';

export function getProcessingMode(): ProcessingMode {
  try {
    const v = localStorage.getItem(PROCESSING_MODE_KEY);
    if (isProcessingMode(v)) return v;
  } catch { /* storage unavailable */ }
  // The legacy 'offline' routing goal meant "local only": honour it.
  return getRoutingGoal() === 'offline' ? 'local-only' : 'hybrid';
}

export function setProcessingMode(mode: ProcessingMode): void {
  try { localStorage.setItem(PROCESSING_MODE_KEY, mode); } catch { /* storage unavailable */ }
}

export function getManualModel(): string | null {
  try { return localStorage.getItem(MANUAL_MODEL_KEY) || null; } catch { return null; }
}

export function setManualModel(modelId: string): void {
  try {
    if (modelId) localStorage.setItem(MANUAL_MODEL_KEY, modelId);
    else localStorage.removeItem(MANUAL_MODEL_KEY);
  } catch { /* storage unavailable */ }
}

export function getReasoningPreference(): ReasoningPreference {
  try {
    const v = localStorage.getItem(REASONING_KEY) as ReasoningPreference | null;
    return v && (REASONING_PREFERENCES as readonly string[]).includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setReasoningPreference(pref: ReasoningPreference): void {
  try { localStorage.setItem(REASONING_KEY, pref); } catch { /* storage unavailable */ }
}
