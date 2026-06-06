// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Action confirm tiers (ROADMAP-600 §1.A #018 step-level confirm tiers,
 * §1.C #106 confirm tiers for mutating ops). Pure classification of an action
 * into auto / confirm / forbidden, with optional per-workspace policy overrides
 * so the agent layer knows when to prompt the user before running an op.
 */

// DEX v6.0 — UKI confirm tiers

export type ConfirmTier = 'auto' | 'confirm' | 'forbidden';

export interface TierableAction {
  /** Operation id, e.g. 'removeBackground' or 'shell.runConfirmed'. */
  op: string;
  /** Whether the op changes the document / has side effects. */
  mutates: boolean;
}

export interface TierPolicy {
  /** Ops that must never run automatically (always blocked). */
  forbidden?: string[];
  /** Ops explicitly allowed to run without a prompt (overrides mutates). */
  autoAllow?: string[];
  /** Force a prompt for these ops even if read-only. */
  alwaysConfirm?: string[];
}

/**
 * Classify an action:
 *  - forbidden  → policy.forbidden lists it
 *  - auto       → read-only, or policy.autoAllow lists it
 *  - confirm    → mutating, or policy.alwaysConfirm lists it
 */
export function tierForAction(action: TierableAction, policy: TierPolicy = {}): ConfirmTier {
  if (policy.forbidden?.includes(action.op)) return 'forbidden';
  if (policy.autoAllow?.includes(action.op)) return 'auto';
  if (policy.alwaysConfirm?.includes(action.op)) return 'confirm';
  return action.mutates ? 'confirm' : 'auto';
}

/** Convenience: does this action need a user prompt under the policy? */
export function requiresConfirm(action: TierableAction, policy?: TierPolicy): boolean {
  return tierForAction(action, policy) === 'confirm';
}

/** Convenience: is this action blocked outright? */
export function isForbidden(action: TierableAction, policy?: TierPolicy): boolean {
  return tierForAction(action, policy) === 'forbidden';
}
