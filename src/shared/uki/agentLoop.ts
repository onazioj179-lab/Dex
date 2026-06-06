// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI agent loop (ROADMAP-600 §1.A #001 multi-step agent, #016 scratchpad,
 * #006 self-critique hook). Iterative think → act → observe over the action
 * executor: decompose a goal, execute it, fold results into a fact scratchpad,
 * then ask a `next` hook for the following goal until done or the budget runs
 * out. Pure — handlers + hooks are injected, so it is fully unit-testable.
 */

// DEX v6.0 — UKI agent loop

import { decompose, type Plan } from './planner';
import { executePlan, type ActionRegistry, type ExecResult } from './actionExecutor';
import type { SkillRegistry } from './skills';

export interface AgentObservation {
  iteration: number;
  goal: string;
  plan: Plan;
  result: ExecResult;
}

export interface AgentRunResult {
  /** True if every executed iteration succeeded. */
  ok: boolean;
  iterations: AgentObservation[];
  /** Accumulated fact scratchpad after the run. */
  facts: Record<string, unknown>;
}

export interface AgentOptions {
  facts?: Record<string, unknown>;
  appId?: string;
  /** Iteration budget. Default 4. */
  maxIterations?: number;
  now?: () => number;
  /**
   * Decide the next goal from the latest observation + scratchpad, or return
   * null to stop. Default: stop after the first iteration (single-shot).
   */
  next?: (obs: AgentObservation, facts: Record<string, unknown>) => string | null;
  /**
   * Fold a finished iteration's results into the scratchpad (the "observe"
   * step). Default: store each ok step's value under `result:<actionId>`.
   */
  reduceFacts?: (res: ExecResult, facts: Record<string, unknown>) => Record<string, unknown>;
}

function defaultReduce(res: ExecResult, facts: Record<string, unknown>): Record<string, unknown> {
  const out = { ...facts };
  for (const r of res.results) {
    if (r.status === 'ok') out[`result:${r.actionId}`] = r.value;
  }
  return out;
}

const EMPTY_RESULT: ExecResult = { ok: false, results: [], undo: [] };

export async function runAgent(
  goal: string,
  skills: SkillRegistry,
  actions: ActionRegistry,
  opts: AgentOptions = {},
): Promise<AgentRunResult> {
  const maxIterations = Math.max(1, opts.maxIterations ?? 4);
  const reduce = opts.reduceFacts ?? defaultReduce;
  let facts: Record<string, unknown> = { ...(opts.facts ?? {}) };
  const iterations: AgentObservation[] = [];
  let currentGoal: string | null = goal;
  let allOk = true;

  for (let i = 0; i < maxIterations && currentGoal; i += 1) {
    const plan = decompose(currentGoal, skills, { facts, appId: opts.appId });
    const result = plan.steps.length === 0
      ? EMPTY_RESULT
      : await executePlan(plan, actions, { facts, appId: opts.appId, now: opts.now });
    if (!result.ok) allOk = false;

    const obs: AgentObservation = { iteration: i, goal: currentGoal, plan, result };
    iterations.push(obs);
    facts = reduce(result, facts);
    currentGoal = opts.next ? opts.next(obs, facts) : null;
  }

  return { ok: allOk, iterations, facts };
}
