// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI action executor: runs a decomposed Plan against a registry of action
 * handlers. Pure logic — no I/O, no DOM. Handlers are injected, so the same
 * executor drives mock handlers in tests and real app operations behind the
 * renderer/main bridges.
 *
 * This closes the gap where appSkills.ts declares `actionId`s but nothing
 * executes them. The full path is:
 *
 *   decompose(goal, skillRegistry)  ->  Plan
 *   executePlan(plan, actionRegistry) -> StepResult[] + undo trail
 *
 * Steps run in dependency order (topoSort), honour `dependsOn`, `optional`
 * and `retries`, interpolate `{{var}}` params from facts + prior step results,
 * and emit an UndoEntry trail compatible with intelligence.ts.
 */

// DEX v6.0 — UKI brain: action executor (GOAL ROADMAP-600 wiring)

import { decompose, topoSort, validatePlan, type Plan, type PlanStep } from './planner';
import type { SkillRegistry } from './skills';
import type { UndoEntry } from './intelligence';

export type StepStatus = 'ok' | 'failed' | 'skipped';

export interface ActionContext {
  /** Facts available to handlers + `{{var}}` interpolation. */
  facts: Record<string, unknown>;
  /** Results of already-completed steps, keyed by step id (for chaining). */
  results: Record<string, unknown>;
  /** Active app id, if any. */
  appId?: string;
}

export type ActionHandler = (
  params: Record<string, unknown>,
  ctx: ActionContext,
) => unknown | Promise<unknown>;

export interface ActionRegistry {
  handlers: Map<string, ActionHandler>;
}

export function createActionRegistry(): ActionRegistry {
  return { handlers: new Map() };
}

/** Register a single handler (returns a new registry — immutable). */
export function registerAction(
  reg: ActionRegistry,
  actionId: string,
  handler: ActionHandler,
): ActionRegistry {
  if (!actionId) throw new Error('actionId required');
  const handlers = new Map(reg.handlers);
  handlers.set(actionId, handler);
  return { handlers };
}

/** Register many handlers at once from an `{ actionId: handler }` map. */
export function registerActions(
  reg: ActionRegistry,
  entries: Record<string, ActionHandler>,
): ActionRegistry {
  const handlers = new Map(reg.handlers);
  for (const [k, v] of Object.entries(entries)) handlers.set(k, v);
  return { handlers };
}

export function hasAction(reg: ActionRegistry, actionId: string): boolean {
  return reg.handlers.has(actionId);
}

export interface StepResult {
  stepId: string;
  actionId: string;
  status: StepStatus;
  value?: unknown;
  error?: string;
  /** Number of times the handler was invoked (>=1 when it ran). */
  attempts: number;
}

export interface ExecResult {
  /** True when no required step failed. */
  ok: boolean;
  results: StepResult[];
  /** Undo trail (newest last) — push straight into intelligence.ts UndoLog. */
  undo: UndoEntry[];
}

export interface ExecOptions {
  facts?: Record<string, unknown>;
  appId?: string;
  /** Hard ceiling on retries per step regardless of step.retries. Default 5. */
  maxRetriesPerStep?: number;
  /** Monotonic clock for undo timestamps (test determinism). Default Date.now. */
  now?: () => number;
  /** Progress callback fired after each step settles. */
  onStep?: (r: StepResult) => void;
  /** Build the opaque undo payload for a successful step. */
  undoPayloadFor?: (step: PlanStep, value: unknown) => unknown;
}

/** Replace `{{name}}` tokens from facts then prior step results (string-only). */
function interpolate(
  params: Record<string, unknown>,
  ctx: ActionContext,
): Record<string, unknown> {
  const lookup: Record<string, unknown> = { ...ctx.facts, ...ctx.results };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
        const fv = lookup[name];
        return fv === undefined ? '' : String(fv);
      });
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Execute a validated Plan against the action registry. Independent steps run
 * to completion even if a sibling fails; dependents of a failed/skipped step
 * are skipped. Returns a per-step result list and an undo trail.
 */
export async function executePlan(
  plan: Plan,
  reg: ActionRegistry,
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const now = opts.now ?? (() => Date.now());
  const maxRetries = Math.max(0, opts.maxRetriesPerStep ?? 5);

  const validation = validatePlan(plan);
  if (!validation.ok) {
    const r: StepResult = {
      stepId: plan.id, actionId: '(plan)', status: 'failed',
      error: validation.errors.join('; '), attempts: 0,
    };
    return { ok: false, results: [r], undo: [] };
  }

  const ordered = topoSort(plan.steps);
  const ctx: ActionContext = { facts: { ...(opts.facts ?? {}) }, results: {}, appId: opts.appId };
  const results: StepResult[] = [];
  const byId = new Map<string, StepResult>();
  const undo: UndoEntry[] = [];
  let undoSeq = 0;

  const settle = (r: StepResult) => {
    results.push(r);
    byId.set(r.stepId, r);
    opts.onStep?.(r);
  };

  for (const step of ordered) {
    const deps = step.dependsOn ?? [];
    const blocked = deps.some((d) => byId.get(d)?.status !== 'ok');
    if (blocked) {
      settle({ stepId: step.id, actionId: step.actionId, status: 'skipped', error: 'dependency not satisfied', attempts: 0 });
      continue;
    }

    const handler = reg.handlers.get(step.actionId);
    if (!handler) {
      settle({
        stepId: step.id, actionId: step.actionId,
        status: step.optional ? 'skipped' : 'failed',
        error: `no handler for ${step.actionId}`, attempts: 0,
      });
      continue;
    }

    const params = interpolate(step.params, ctx);
    const retries = Math.min(maxRetries, Math.max(0, step.retries ?? 0));
    let attempts = 0;
    let value: unknown;
    let error: string | undefined;
    let ranOk = false;
    while (attempts <= retries) {
      attempts += 1;
      try {
        value = await handler(params, ctx);
        ranOk = true;
        error = undefined;
        break;
      } catch (e) {
        error = (e as Error)?.message ?? String(e);
      }
    }

    const status: StepStatus = ranOk ? 'ok' : (step.optional ? 'skipped' : 'failed');
    settle({
      stepId: step.id, actionId: step.actionId, status, attempts,
      value: ranOk ? value : undefined,
      error: ranOk ? undefined : error,
    });

    if (ranOk) {
      ctx.results[step.id] = value;
      const payload = opts.undoPayloadFor
        ? opts.undoPayloadFor(step, value)
        : { actionId: step.actionId, params };
      undoSeq += 1;
      undo.push({ id: `undo-${undoSeq}`, recordedAt: now(), label: step.actionId, payload });
    }
  }

  const ok = results.every((r) => r.status !== 'failed');
  return { ok, results, undo };
}

export interface RunResult extends ExecResult {
  /** The plan that was decomposed and run (zero steps = goal not understood). */
  plan: Plan;
}

/**
 * End-to-end convenience: decompose a natural-language goal against the skill
 * registry, then execute the resulting plan with the action registry.
 */
export async function runGoal(
  goal: string,
  skills: SkillRegistry,
  actions: ActionRegistry,
  opts: ExecOptions = {},
): Promise<RunResult> {
  const plan = decompose(goal, skills, { facts: opts.facts, appId: opts.appId });
  if (plan.steps.length === 0) {
    return { ok: false, results: [], undo: [], plan };
  }
  const exec = await executePlan(plan, actions, opts);
  return { ...exec, plan };
}
