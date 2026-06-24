// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Smart Router (UKI 2.0). Turns a routing **goal** + a quick task classification
 * into a ranked list of model ids the orchestrator can run through
 * `chatWithFallback` — automatically choosing the cheapest / fastest / smartest /
 * offline model, or an `auto` heuristic that adapts to the task. Pure policy: it
 * produces the *order*; the orchestrator does the sending. Decoupled from the
 * provider registry (renderer layer) by taking plain candidate descriptors, so it
 * lives in shared/ and is fully unit-testable.
 */

import { estimateTokens } from './contextFit';
import { getModelProfile, INTELLIGENCE_SCORE, LATENCY_SCORE, blendedCost } from './modelProfiles';

export type RoutingGoal = 'auto' | 'cheapest' | 'fastest' | 'smartest' | 'offline';

/** All goals, in display order (Settings selector + iteration). */
export const ROUTING_GOALS: readonly RoutingGoal[] = ['auto', 'cheapest', 'fastest', 'smartest', 'offline'];

/** Human label for a goal (Settings UI). */
export function routingGoalLabel(goal: RoutingGoal): string {
  switch (goal) {
    case 'cheapest': return 'Cheapest';
    case 'fastest':  return 'Fastest';
    case 'smartest': return 'Smartest';
    case 'offline':  return 'Offline';
    case 'auto':
    default:         return 'Auto';
  }
}

/** What a single prompt looks like to the router (capability + size demands). */
export interface TaskFeatures {
  needsVision: boolean;
  needsTools: boolean;
  isCode: boolean;
  isLongContext: boolean;
  estimatedTokens: number;
}

/** A model the router may choose, with the capability data it filters on. */
export interface RouteCandidate {
  id: string;
  contextWindow: number;
  vision: boolean;
  tools: boolean;
}

/** Token estimate above which a task is treated as "long context" by auto routing. */
const LONG_CONTEXT_TOKENS = 8000;

const VISION_RE = /\b(image|images|screenshot|screenshots|photo|photos|picture|pictures|diagram|chart|scan|ocr)\b/i;
const TOOLS_RE = /\b(search the web|browse|run this|execute|call the api|fetch the|look up online)\b/i;
const CODE_RE = /```|\b(function|const |class |def |import |#include|public static|stack ?trace|traceback|compile|refactor|segfault|null pointer)\b/i;

/** Classify a prompt into routing features (fast heuristic, pure). */
export function classifyTask(prompt: string): TaskFeatures {
  const text = prompt ?? '';
  const estimatedTokens = estimateTokens(text);
  return {
    needsVision: VISION_RE.test(text),
    needsTools: TOOLS_RE.test(text),
    isCode: CODE_RE.test(text),
    isLongContext: estimatedTokens > LONG_CONTEXT_TOKENS,
    estimatedTokens,
  };
}

/**
 * A "routine" task has no hard requirements — no vision, no tool use, not code,
 * and not long-context. These are the summarize / extract / rewrite / short-Q&A
 * tasks a small on-device model handles well (Apple Foundation Models guidance),
 * so they are the ones worth routing on-device first.
 */
export function isRoutineTask(task: TaskFeatures): boolean {
  return !task.needsVision && !task.needsTools && !task.isCode && !task.isLongContext;
}

/**
 * Tiered on-device-first ordering (DEX_FEATURE_BACKLOG P0). For a ROUTINE task,
 * move configured LOCAL models (e.g. Ollama) to the front of the already-ranked
 * list so the caller tries the local model first and falls back to hosted models
 * automatically (chatWithFallback walks the list in order) — the Apple Foundation
 * Models + Private Cloud Compute tiered pattern, adapted to UKI's existing
 * provider-agnostic routing. Hard tasks (vision / tools / code / long-context)
 * keep their quality-ranked order. Pure; relative order is preserved per tier.
 *
 * `canRunLocal` lets the on-device runtime abstraction (deviceRuntime) exclude
 * local models this machine can't run acceptably (e.g. an 8B model on a CPU-only
 * laptop) — such models are NOT fronted and fall back to their ranked position.
 * Defaults to "all local models runnable" so existing callers are unaffected.
 */
export function preferOnDeviceFirst(
  modelIds: readonly string[],
  task: TaskFeatures,
  canRunLocal: (id: string) => boolean = () => true,
): string[] {
  if (!isRoutineTask(task)) return [...modelIds];
  const runnableLocal = modelIds.filter((id) => getModelProfile(id).local && canRunLocal(id));
  if (runnableLocal.length === 0) return [...modelIds];
  const rest = modelIds.filter((id) => !runnableLocal.includes(id));
  return [...runnableLocal, ...rest];
}

/**
 * Drop candidates that cannot satisfy the task's hard requirements (vision,
 * tools, context size). Never strands the caller: if the capability filter
 * empties the set, it relaxes to a context-only filter, then to all candidates.
 */
function filterCapable(task: TaskFeatures, candidates: readonly RouteCandidate[]): RouteCandidate[] {
  const capable = candidates.filter((c) => {
    if (task.needsVision && !c.vision) return false;
    if (task.needsTools && !c.tools) return false;
    if (c.contextWindow < task.estimatedTokens) return false;
    return true;
  });
  if (capable.length > 0) return capable;
  const ctxOnly = candidates.filter((c) => c.contextWindow >= task.estimatedTokens);
  return ctxOnly.length > 0 ? ctxOnly : [...candidates];
}

type Comparator = (a: RouteCandidate, b: RouteCandidate) => number;

const byCheapest: Comparator = (a, b) =>
  blendedCost(getModelProfile(a.id)) - blendedCost(getModelProfile(b.id));

const byFastest: Comparator = (a, b) =>
  LATENCY_SCORE[getModelProfile(b.id).latencyClass] - LATENCY_SCORE[getModelProfile(a.id).latencyClass];

const bySmartest: Comparator = (a, b) =>
  INTELLIGENCE_SCORE[getModelProfile(b.id).intelligenceTier] - INTELLIGENCE_SCORE[getModelProfile(a.id).intelligenceTier];

/** Stable rank: primary comparator, ties broken by secondary, then input order. */
function rankBy(candidates: readonly RouteCandidate[], primary: Comparator, secondary: Comparator): RouteCandidate[] {
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((x, y) => primary(x.c, y.c) || secondary(x.c, y.c) || x.i - y.i)
    .map((e) => e.c);
}

/**
 * Rank candidate models for a goal + task. Returns model ids best-first, ready
 * for `chatWithFallback`. `offline` keeps only on-device models (may be empty if
 * the user has none — the caller then degrades). Other goals assume the caller
 * has already chosen the candidate set (e.g. only key-configured providers).
 */
export function routeModels(goal: RoutingGoal, task: TaskFeatures, candidates: readonly RouteCandidate[]): string[] {
  if (candidates.length === 0) return [];

  if (goal === 'offline') {
    const local = candidates.filter((c) => getModelProfile(c.id).local);
    if (local.length === 0) return [];
    return rankBy(filterCapable(task, local), bySmartest, byFastest).map((c) => c.id);
  }

  const capable = filterCapable(task, candidates);

  switch (goal) {
    case 'cheapest': return rankBy(capable, byCheapest, byFastest).map((c) => c.id);
    case 'fastest':  return rankBy(capable, byFastest, byCheapest).map((c) => c.id);
    case 'smartest': return rankBy(capable, bySmartest, byCheapest).map((c) => c.id);
    case 'auto':
    default: {
      // Hard tasks (code / long context / tool use) favour capability, then
      // cost. Light tasks favour cost+speed (cheap, snappy replies).
      const hard = task.isCode || task.isLongContext || task.needsTools;
      return hard
        ? rankBy(capable, bySmartest, byCheapest).map((c) => c.id)
        : rankBy(capable, byCheapest, byFastest).map((c) => c.id);
    }
  }
}

/**
 * The first `n` unique ids to run concurrently — the basis for the vision's
 * "parallel model execution" (race several models, take the first/best).
 */
export function fanOutModels(modelIds: readonly string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of modelIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= n) break;
  }
  return out;
}
