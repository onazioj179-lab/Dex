// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Creative goal runner (ROADMAP-600 #094). The full live path:
 *
 *   NL goal
 *     -> matchSkills / decompose (appSkills)
 *     -> executePlan with the creative action handlers  (CreativeOp descriptors)
 *     -> UkiCreativeOperator.dispatchCreativeOp           (confidence + whitelist + audit)
 *     -> per-app IPC handler via the injected `invoker`.
 *
 * The `invoker` is the real IPC bridge in production and a stub in tests, so this
 * module stays free of Electron/IPC imports.
 */

// DEX v6.0 — UKI creative runner

import { runGoal } from '../../shared/uki/actionExecutor';
import { loadAppSkillRegistry } from '../../shared/uki/appSkills';
import { creativeActionRegistry, type CreativeOp } from '../../shared/uki/creativeActions';
import {
  getUkiCreativeOperator, type DispatchResult, type Invoker,
} from './domains/UkiCreativeOperator';
import type { Plan } from '../../shared/uki/planner';

const CREATIVE_APPS = ['prism', 'vinx', 'imosion', 'flux', 'axl'] as const;

function isCreativeOp(v: unknown): v is CreativeOp {
  return !!v && typeof v === 'object'
    && typeof (v as CreativeOp).app === 'string'
    && typeof (v as CreativeOp).op === 'string'
    && 'params' in (v as object);
}

export interface RunCreativeOptions {
  /** Active creative app id, scopes skill matching. */
  appId?: string;
  /** Known facts (layerId, clipId, trackId, projectId, …). */
  facts?: Record<string, unknown>;
  /** Confidence handed to the operator's gate (default 1 for explicit asks). */
  confidence?: number;
}

export interface RunCreativeResult {
  /** The decomposed plan (zero steps = goal not understood). */
  plan: Plan;
  /** Dispatch results for each creative op that ran, in order. */
  dispatched: DispatchResult[];
}

/**
 * Run a natural-language creative goal end-to-end, dispatching each resulting
 * CreativeOp through the singleton operator with the supplied IPC invoker.
 */
export async function runCreativeGoal(
  goal: string,
  invoker: Invoker,
  opts: RunCreativeOptions = {},
): Promise<RunCreativeResult> {
  const skills = loadAppSkillRegistry([...CREATIVE_APPS]);
  const actions = creativeActionRegistry();
  const res = await runGoal(goal, skills, actions, { appId: opts.appId, facts: opts.facts });

  const operator = getUkiCreativeOperator();
  const dispatched: DispatchResult[] = [];
  for (const step of res.results) {
    if (step.status === 'ok' && isCreativeOp(step.value)) {
      dispatched.push(await operator.dispatchCreativeOp(step.value, invoker, { confidence: opts.confidence }));
    }
  }
  return { plan: res.plan, dispatched };
}
