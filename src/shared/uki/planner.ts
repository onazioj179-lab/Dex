// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI planner: decompose a natural-language goal into an ordered list of
 * action steps with dependency edges. Pure logic — no I/O, no model calls.
 *
 * The planner does not "think" — it pattern-matches the goal against the
 * provided skill registry and emits a Plan. The actual reasoning lives in
 * skills.ts (skill matching) and toolCall.ts (typed dispatch).
 */

// DEX v3.8.9 - UKI brain: planner

import type { Skill, SkillRegistry } from './skills';

export interface PlanStep {
  id: string;
  actionId: string;
  params: Record<string, unknown>;
  /** Step ids that must complete before this step runs. */
  dependsOn?: string[];
  /** Step may fail without aborting the plan. */
  optional?: boolean;
  /** Max retry count for transient failures. Default 0. */
  retries?: number;
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
}

export interface PlanContext {
  /** Already-known facts available to skill templates. */
  facts?: Record<string, unknown>;
  /** Active app id, if any. */
  appId?: string;
}

export interface DecomposeOptions {
  /** Override id generator (test determinism). */
  newId?: () => string;
  /** Cap on number of steps (defence in depth). */
  maxSteps?: number;
}

let _seq = 0;
function defaultNewId(): string { _seq += 1; return `step-${_seq}`; }

/**
 * Decompose a goal into a Plan by selecting the best-matching skill in the
 * registry and instantiating its template with the goal + context.
 *
 * Returns a Plan with at least one step on success, or a Plan with zero
 * steps if no skill matched (caller should treat as "I don't know").
 */
export function decompose(
  goal: string,
  registry: SkillRegistry,
  context: PlanContext = {},
  opts: DecomposeOptions = {},
): Plan {
  const newId = opts.newId ?? defaultNewId;
  const maxSteps = opts.maxSteps ?? 32;
  const planId = newId();
  const trimmed = (goal ?? '').trim();
  if (!trimmed) return { id: planId, goal: '', steps: [] };

  // Lazy import to avoid circular: skills exports matchSkills which imports
  // this file's types. We accept registry directly so no module cycle.
  const matched = rankSkillsLocal(trimmed, registry, context);
  if (matched.length === 0) return { id: planId, goal: trimmed, steps: [] };
  const skill = matched[0];
  const steps: PlanStep[] = [];
  for (const t of skill.plan.steps.slice(0, maxSteps)) {
    steps.push({
      id: newId(),
      actionId: t.actionId,
      params: substituteParams(t.params, { goal: trimmed, ...(context.facts ?? {}) }),
      dependsOn: t.dependsOn ? [...t.dependsOn] : undefined,
      optional: t.optional,
      retries: t.retries,
    });
  }
  return { id: planId, goal: trimmed, steps };
}

function substituteParams(
  template: Record<string, unknown>,
  facts: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(template)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
        const fv = facts[name];
        return fv === undefined ? '' : String(fv);
      });
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Local rank helper to avoid module cycle with skills.ts.
function rankSkillsLocal(goal: string, registry: SkillRegistry, ctx: PlanContext): Skill[] {
  const lower = goal.toLowerCase();
  const scored: Array<{ s: Skill; score: number }> = [];
  for (const s of registry.skills) {
    let score = 0;
    if (typeof s.intent === 'string') {
      if (lower.includes(s.intent.toLowerCase())) score += 10;
    } else {
      if (s.intent.test(lower)) score += 12;
    }
    if (s.requiredContext && s.requiredContext.length > 0) {
      const have = ctx.facts ?? {};
      const missing = s.requiredContext.filter((k) => !(k in have));
      if (missing.length > 0) score -= 5 * missing.length;
      else score += 2;
    }
    if (score > 0) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.s);
}

/**
 * Topologically sort plan steps by dependsOn. Throws on cycles.
 */
export function topoSort(steps: PlanStep[]): PlanStep[] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const out: PlanStep[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    if (stack.has(id)) throw new Error(`plan cycle at ${id}`);
    stack.add(id);
    const node = byId.get(id);
    if (!node) throw new Error(`unknown step ${id}`);
    for (const dep of node.dependsOn ?? []) visit(dep);
    stack.delete(id);
    visited.add(id);
    out.push(node);
  }
  for (const s of steps) visit(s.id);
  return out;
}

export interface PlanValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Validate plan structure: unique ids, deps resolve, no cycles, sane sizes.
 */
export function validatePlan(plan: Plan, opts: { maxSteps?: number } = {}): PlanValidation {
  const errors: string[] = [];
  const max = opts.maxSteps ?? 64;
  if (!plan.id) errors.push('plan.id missing');
  if (plan.steps.length > max) errors.push(`too many steps (${plan.steps.length} > ${max})`);
  const ids = new Set<string>();
  for (const s of plan.steps) {
    if (ids.has(s.id)) errors.push(`duplicate step id ${s.id}`);
    ids.add(s.id);
    if (!s.actionId) errors.push(`step ${s.id} missing actionId`);
  }
  for (const s of plan.steps) {
    for (const dep of s.dependsOn ?? []) {
      if (!ids.has(dep)) errors.push(`step ${s.id} depends on unknown ${dep}`);
    }
  }
  if (errors.length === 0) {
    try { topoSort(plan.steps); } catch (e) { errors.push((e as Error).message); }
  }
  return { ok: errors.length === 0, errors };
}

/** Reset the internal id counter (test determinism). */
export function _resetPlannerIds(): void { _seq = 0; }
