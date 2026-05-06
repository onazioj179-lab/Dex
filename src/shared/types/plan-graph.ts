// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX PlanGraph
 * -----------------------------------------------------------------------------
 * Typed shape for multi-step UKI plans. UKI parses an intent string into a
 * PlanGraph; ActionBus then executes each step in order, emitting progress and
 * surfacing an approval gate before destructive operations.
 */

// DEX v3.8.0 - PlanGraph types

export type ActionRiskLevel = 'safe' | 'reversible' | 'destructive';

export interface ActionStep {
  /** Stable id within the plan (used for progress + dedupe). */
  id: string;
  /** Action namespace, e.g. "file.delete", "system.brightness", "vinx.export". */
  action: string;
  /** Free-form payload; each handler validates its own shape. */
  payload?: Record<string, unknown>;
  /** Human-readable label shown to the user in the approval card. */
  label: string;
  /** Risk classification — drives whether approval gate is required. */
  risk: ActionRiskLevel;
  /** Optional list of step ids that must complete before this one runs. */
  dependsOn?: string[];
}

export interface PlanGraph {
  /** Stable id for the whole plan; mirrors UKI conversation turn. */
  id: string;
  /** The original user utterance (trimmed). */
  utterance: string;
  /** Ordered/declared steps. Execution honours `dependsOn` when present. */
  steps: ActionStep[];
  /** Created at (epoch ms). */
  createdAt: number;
  /** Plan-level risk = max(step.risk). Computed by builder. */
  risk: ActionRiskLevel;
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PlanStepResult {
  stepId: string;
  status: PlanStepStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  output?: unknown;
}

export const RISK_ORDER: Record<ActionRiskLevel, number> = {
  safe: 0,
  reversible: 1,
  destructive: 2,
};

export function maxRisk(a: ActionRiskLevel, b: ActionRiskLevel): ActionRiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export function planRisk(steps: ActionStep[]): ActionRiskLevel {
  return steps.reduce<ActionRiskLevel>((acc, s) => maxRisk(acc, s.risk), 'safe');
}
