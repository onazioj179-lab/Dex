// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Creative command orchestrator (ROADMAP-600 #095 NL command bar, #003 plan
 * preview, #018/#106 confirm tiers). This is the renderer-safe glue that turns
 * a natural-language goal typed in a creative app into a *previewable*,
 * *confirmable* list of `CreativeOp` descriptors — without touching the live
 * document. It composes four previously-orphaned modules into one path:
 *
 *   appSkills (loadAppSkillRegistry)         — NL intent -> skill
 *   actionExecutor (runGoal)                 — skill -> Plan -> CreativeOp descriptors
 *   planSummary (summarizePlan)              — human-readable preview text  (#003)
 *   confirmTier (tierForAction)              — auto vs. confirm vs. forbidden (#018/#106)
 *
 * The creative action handlers are pure (they return descriptors, no I/O), so
 * `runGoal` here is a side-effect-free dry run: the resulting ops ARE the
 * preview. Applying them to the live document is the host app's job (it owns the
 * pixels/timeline/tracks), keeping this module headless + unit-testable.
 */

// DEX v6.0 — UKI creative command orchestrator

import { runGoal } from './actionExecutor';
import { loadAppSkillRegistry } from './appSkills';
import { creativeActionRegistry, type CreativeApp, type CreativeOp } from './creativeActions';
import { summarizePlan } from './planSummary';
import { tierForAction, type ConfirmTier, type TierPolicy } from './confirmTier';
import type { Plan } from './planner';

const CREATIVE_APPS = ['prism', 'vinx', 'imosion', 'flux', 'axl'] as const;

function isCreativeOp(v: unknown): v is CreativeOp {
  return !!v && typeof v === 'object'
    && typeof (v as CreativeOp).app === 'string'
    && typeof (v as CreativeOp).op === 'string'
    && 'params' in (v as object)
    && typeof (v as CreativeOp).mutates === 'boolean';
}

export interface BuildCommandOptions {
  /** Active creative app id — scopes intent matching to that app's skills. */
  appId?: CreativeApp;
  /** Known facts (layerId, selectionId, clipId, trackId, projectId, …). */
  facts?: Record<string, unknown>;
  /** Per-workspace confirm-tier policy. */
  policy?: TierPolicy;
}

export interface CreativeCommand {
  /** The trimmed goal as understood. */
  goal: string;
  /** True when at least one op was produced (i.e. intent recognised). */
  understood: boolean;
  /** The decomposed plan (0 steps = not understood). */
  plan: Plan;
  /** Pure op descriptors ready to apply, in execution order. */
  ops: CreativeOp[];
  /** Human-readable preview of the plan (#003). */
  summary: string;
  /** True if any op mutates the document. */
  mutates: boolean;
  /** Overall confirm tier across all ops (forbidden > confirm > auto). */
  tier: ConfirmTier;
}

/**
 * Overall tier for a set of ops: the strictest wins. A single forbidden op
 * blocks the batch; otherwise any mutating/always-confirm op requires a prompt.
 */
export function tierForOps(ops: CreativeOp[], policy: TierPolicy = {}): ConfirmTier {
  let tier: ConfirmTier = 'auto';
  for (const op of ops) {
    const t = tierForAction({ op: op.op, mutates: op.mutates }, policy);
    if (t === 'forbidden') return 'forbidden';
    if (t === 'confirm') tier = 'confirm';
  }
  return tier;
}

/**
 * Turn a natural-language goal into a previewable creative command. Never
 * throws on an unrecognised goal — returns `understood: false` with an empty
 * op list and an explanatory summary so the UI can show "I didn't get that".
 */
export async function buildCreativeCommand(
  goal: string,
  opts: BuildCommandOptions = {},
): Promise<CreativeCommand> {
  const trimmed = (goal ?? '').trim();
  const skills = loadAppSkillRegistry([...CREATIVE_APPS]);
  const actions = creativeActionRegistry();
  const res = await runGoal(trimmed, skills, actions, { appId: opts.appId, facts: opts.facts });

  // The planner scores a skill >0 when its requiredContext is satisfied even if
  // the *intent* didn't match — so with facts present any text would yield a
  // spurious op. A command bar must only act on a genuine intent match, so we
  // gate the ops on the goal actually mentioning a skill's intent. This keeps
  // the bar from inventing actions for unrelated text.
  const goalLower = trimmed.toLowerCase();
  const intentMatched = !!trimmed && skills.skills.some((s) =>
    typeof s.intent === 'string'
      ? goalLower.includes(s.intent.toLowerCase())
      : s.intent.test(goalLower),
  );

  const ops: CreativeOp[] = [];
  if (intentMatched) {
    for (const step of res.results) {
      if (step.status === 'ok' && isCreativeOp(step.value)) ops.push(step.value);
    }
  }

  const understood = ops.length > 0;
  const mutates = ops.some((o) => o.mutates);
  // Keep the exposed plan/summary consistent with the intent gate.
  const plan = intentMatched ? res.plan : { ...res.plan, steps: [] };
  return {
    goal: trimmed,
    understood,
    plan,
    ops,
    summary: summarizePlan(plan),
    mutates,
    tier: tierForOps(ops, opts.policy),
  };
}

export type ApplyOutcome = 'applied' | 'failed' | 'skipped';

export interface AppliedOp {
  op: CreativeOp;
  outcome: ApplyOutcome;
  /** Free-form note from the host applier (error, "engine pending", etc.). */
  note?: string;
}

export interface ApplyReport {
  applied: number;
  failed: number;
  skipped: number;
  total: number;
  results: AppliedOp[];
  /** True when nothing failed. */
  ok: boolean;
}

/**
 * What a host applier may return for one op:
 *  - `void` / a note string  → the op was applied (with an optional note)
 *  - `{ outcome, note }`      → explicit outcome; use `'skipped'` for ops that
 *                               are recognised but have no local engine yet
 *                               (engine-pending is NOT an error)
 *  - throwing                 → the op failed
 */
export type OpApplyResult =
  | void
  | string
  | { outcome: Exclude<ApplyOutcome, 'failed'>; note?: string };

/** Per-op applier supplied by the host app. */
export type OpApplier = (op: CreativeOp) => Promise<OpApplyResult> | OpApplyResult;

/**
 * A host applier that honestly reports every op as engine-pending (skipped),
 * for creative apps whose ops are all engine-bound (no local fast-path yet).
 * Wrap it to add real local ops, e.g.:
 *   (op) => op.op === 'autoEnhance' ? doIt() : enginePendingApplier('Vinx')(op)
 */
export function enginePendingApplier(appLabel: string): OpApplier {
  return (op) => ({
    outcome: 'skipped',
    note: `${op.op}: needs the ${appLabel} engine (not in this build)`,
  });
}

/**
 * Apply a built command's ops in order via the host applier, collecting a
 * per-op report. A thrown applier marks that op failed but does not abort the
 * batch (later ops still run), mirroring the executor's independent-step model.
 * A `{ outcome: 'skipped' }` return is honest "recognised but no engine yet".
 */
export async function applyCreativeCommand(
  ops: CreativeOp[],
  apply: OpApplier,
): Promise<ApplyReport> {
  const results: AppliedOp[] = [];
  for (const op of ops) {
    try {
      const r = await apply(op);
      if (r && typeof r === 'object') {
        results.push({ op, outcome: r.outcome, note: r.note });
      } else {
        results.push({ op, outcome: 'applied', note: r || undefined });
      }
    } catch (e) {
      results.push({ op, outcome: 'failed', note: (e as Error)?.message ?? String(e) });
    }
  }
  const applied = results.filter((r) => r.outcome === 'applied').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  const skipped = results.filter((r) => r.outcome === 'skipped').length;
  return { applied, failed, skipped, total: results.length, results, ok: failed === 0 };
}
