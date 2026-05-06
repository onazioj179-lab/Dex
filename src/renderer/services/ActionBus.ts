// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX ActionBus
 * -----------------------------------------------------------------------------
 * Companion to ContextBus. Apps register handlers for action namespaces (e.g.
 * "file.delete", "vinx.export"). UKI builds a PlanGraph and asks ActionBus to
 * execute it; ActionBus walks the steps, calling the right handler, emitting
 * progress events that the approval card / dock pill can subscribe to.
 *
 * Risk handling:
 *   - 'safe'        runs immediately
 *   - 'reversible'  runs immediately but emits a "rolled back available" event
 *   - 'destructive' triggers `action:awaiting-approval`; only continues after
 *                   approve(planId) is called (or rejects on deny()).
 */

// DEX v3.8.0 - ActionBus

import type {
  ActionStep,
  PlanGraph,
  PlanStepResult,
  PlanStepStatus,
} from '../../shared/types/plan-graph';

export interface ActionContext {
  planId: string;
  stepId: string;
  signal: AbortSignal;
}

export type ActionHandler = (
  payload: Record<string, unknown> | undefined,
  ctx: ActionContext,
) => Promise<unknown> | unknown;

export interface ActionBusEventMap {
  'plan:started':  { planId: string; stepCount: number };
  'plan:finished': { planId: string; results: PlanStepResult[] };
  'plan:failed':   { planId: string; error: string; results: PlanStepResult[] };
  'plan:awaiting-approval': { plan: PlanGraph };
  'plan:approved': { planId: string };
  'plan:denied':   { planId: string };
  'step:started':  { planId: string; step: ActionStep };
  'step:progress': { planId: string; stepId: string; pct: number; note?: string };
  'step:finished': { planId: string; result: PlanStepResult };
}

export type ActionBusChannel = keyof ActionBusEventMap;
type Listener<C extends ActionBusChannel> = (p: ActionBusEventMap[C]) => void;

interface PendingPlan {
  plan: PlanGraph;
  resolve: () => void;
  reject: (reason: string) => void;
}

const handlers = new Map<string, ActionHandler>();
const listeners = new Map<ActionBusChannel, Set<Listener<ActionBusChannel>>>();
const pending = new Map<string, PendingPlan>();
const aborts = new Map<string, AbortController>();

function emit<C extends ActionBusChannel>(channel: C, payload: ActionBusEventMap[C]): void {
  const set = listeners.get(channel);
  if (!set) return;
  set.forEach((l) => {
    try { (l as Listener<C>)(payload); }
    catch (err) { console.error('[ActionBus]', channel, err); }
  });
}

function on<C extends ActionBusChannel>(channel: C, listener: Listener<C>): () => void {
  let set = listeners.get(channel);
  if (!set) { set = new Set(); listeners.set(channel, set); }
  set.add(listener as Listener<ActionBusChannel>);
  return () => { set!.delete(listener as Listener<ActionBusChannel>); };
}

function register(action: string, handler: ActionHandler): () => void {
  if (handlers.has(action)) {
    console.warn('[ActionBus] overriding handler for', action);
  }
  handlers.set(action, handler);
  return () => {
    if (handlers.get(action) === handler) handlers.delete(action);
  };
}

function isRegistered(action: string): boolean {
  return handlers.has(action);
}

function listActions(): string[] {
  return Array.from(handlers.keys()).sort();
}

async function waitForApproval(plan: PlanGraph): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    pending.set(plan.id, { plan, resolve, reject });
    emit('plan:awaiting-approval', { plan });
  });
}

function approve(planId: string): boolean {
  const entry = pending.get(planId);
  if (!entry) return false;
  pending.delete(planId);
  emit('plan:approved', { planId });
  entry.resolve();
  return true;
}

function deny(planId: string): boolean {
  const entry = pending.get(planId);
  if (!entry) return false;
  pending.delete(planId);
  emit('plan:denied', { planId });
  entry.reject('denied');
  return true;
}

function cancel(planId: string): boolean {
  const ctrl = aborts.get(planId);
  if (ctrl) { ctrl.abort(); aborts.delete(planId); return true; }
  return deny(planId);
}

async function runStep(
  planId: string,
  step: ActionStep,
  signal: AbortSignal,
): Promise<PlanStepResult> {
  const handler = handlers.get(step.action);
  const startedAt = Date.now();
  const base: PlanStepResult = { stepId: step.id, status: 'running', startedAt };

  if (!handler) {
    const failed: PlanStepResult = {
      ...base,
      status: 'failed',
      finishedAt: Date.now(),
      error: `no handler for "${step.action}"`,
    };
    emit('step:finished', { planId, result: failed });
    return failed;
  }

  emit('step:started', { planId, step });
  try {
    const output = await Promise.resolve(handler(step.payload, { planId, stepId: step.id, signal }));
    const status: PlanStepStatus = signal.aborted ? 'skipped' : 'done';
    const result: PlanStepResult = { ...base, status, finishedAt: Date.now(), output };
    emit('step:finished', { planId, result });
    return result;
  } catch (err) {
    const result: PlanStepResult = {
      ...base,
      status: 'failed',
      finishedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
    emit('step:finished', { planId, result });
    return result;
  }
}

async function execute(plan: PlanGraph): Promise<PlanStepResult[]> {
  if (plan.risk === 'destructive') {
    try { await waitForApproval(plan); }
    catch {
      const skipped = plan.steps.map<PlanStepResult>((s) => ({ stepId: s.id, status: 'skipped' }));
      emit('plan:failed', { planId: plan.id, error: 'denied', results: skipped });
      return skipped;
    }
  }

  const ctrl = new AbortController();
  aborts.set(plan.id, ctrl);
  emit('plan:started', { planId: plan.id, stepCount: plan.steps.length });

  const results: PlanStepResult[] = [];
  const done = new Set<string>();
  const remaining = [...plan.steps];

  while (remaining.length > 0) {
    const idx = remaining.findIndex((s) => (s.dependsOn ?? []).every((d) => done.has(d)));
    if (idx === -1) {
      // Cyclic / unresolvable deps — fail the rest.
      remaining.forEach((s) => results.push({ stepId: s.id, status: 'skipped', error: 'unresolved deps' }));
      break;
    }
    const step = remaining.splice(idx, 1)[0];
    const r = await runStep(plan.id, step, ctrl.signal);
    results.push(r);
    if (r.status === 'done') done.add(step.id);
    if (r.status === 'failed') {
      remaining.forEach((s) => results.push({ stepId: s.id, status: 'skipped', error: 'upstream failure' }));
      break;
    }
    if (ctrl.signal.aborted) break;
  }

  aborts.delete(plan.id);
  const failed = results.find((r) => r.status === 'failed');
  if (failed) emit('plan:failed', { planId: plan.id, error: failed.error || 'failed', results });
  else emit('plan:finished', { planId: plan.id, results });
  return results;
}

function _reset(): void {
  handlers.clear();
  listeners.clear();
  pending.clear();
  aborts.forEach((c) => c.abort());
  aborts.clear();
}

export const ActionBus = {
  register,
  isRegistered,
  listActions,
  on,
  execute,
  approve,
  deny,
  cancel,
  pending: (): PlanGraph[] => Array.from(pending.values()).map((e) => e.plan),
  _reset,
};

export default ActionBus;
