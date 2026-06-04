// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Operator
 * -----------------------------------------------------------------------------
 * Turns UKI from a command box into a desktop operator. Composes the live
 * desktop snapshot (context.ts), the active project (from the ContextBus
 * continuity:project channel), the workflow templates she can launch, and the
 * troubleshooting knowledge she can diagnose with — into a single briefing and
 * a tiny intent router. Prompt builders call `toPromptContext()` so the model
 * always sees what is open, which project is active, and what it can do next.
 *
 * Pure composition over existing modules — no new state, no timers.
 */

import ContextBus from '../services/ContextBus';
import { liveContext, type LiveContext } from './context';
import { findTroubleshooting, type DexTroubleshooting } from './knowledge';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../services/workflowTemplates';
import { getWorkloadStatus, type WorkloadPolicy } from '../services/WorkloadGovernor';
import { createUnifiedSearch } from '../services/searchProviders';
import type { SearchResult } from '../../shared/search/SearchOrchestrator';
import type { UkiContextSnapshot } from './identity';

/** Most-recent active project id, read from the continuity:project channel. */
export function getActiveProjectId(): string | undefined {
  try {
    const events = ContextBus.replay('continuity:project');
    const last = events[events.length - 1];
    return last ? (last.payload as { projectId?: string }).projectId : undefined;
  } catch {
    return undefined;
  }
}

/** Rank workflow templates by overlap with currently-open apps. */
export function suggestWorkflows(openAppIds: readonly string[] = [], limit = 3): WorkflowTemplate[] {
  const open = new Set(openAppIds);
  if (open.size === 0) return WORKFLOW_TEMPLATES.slice(0, limit);
  return WORKFLOW_TEMPLATES
    .map((t) => ({ t, score: t.apps.reduce((n, a) => n + (open.has(a) ? 1 : 0), 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.t);
}

export interface OperatorBriefing {
  foregroundAppId?: string;
  openAppIds: readonly string[];
  activeProjectId?: string;
  online: boolean;
  localTime: string;
  /** Workflow templates that fit what is currently open (best-effort). */
  relevantWorkflows: readonly WorkflowTemplate[];
  /** Advisory workload policy from the Workload Governor. */
  systemPolicy: WorkloadPolicy;
}

/** Build a one-shot operator briefing of the current desktop + project. */
export function buildOperatorBriefing(ctx: LiveContext = liveContext()): OperatorBriefing {
  return {
    foregroundAppId: ctx.foregroundAppId,
    openAppIds: ctx.openAppIds,
    activeProjectId: getActiveProjectId(),
    online: ctx.online,
    localTime: ctx.localTime,
    relevantWorkflows: suggestWorkflows(ctx.openAppIds),
    systemPolicy: getWorkloadStatus().policy,
  };
}

/** Diagnose a problem query against DEX troubleshooting knowledge. */
export function diagnose(query: string, limit = 3): DexTroubleshooting[] {
  return findTroubleshooting(query, limit);
}

// One unified search over apps + workflows + assets, built lazily and reused.
// No command registry here — the operator's retrieval spans static + library
// sources that don't need live UI state.
let _envSearch: ReturnType<typeof createUnifiedSearch> | undefined;
function envSearch() {
  return (_envSearch ??= createUnifiedSearch());
}

/**
 * Retrieve resources from across the environment (apps + workflows + assets) the
 * way UKI does to answer "find me X" / "where is Y" — the operator's
 * context-retrieval + resource-recommendation capability. Returns the blended,
 * ranked unified-search results. Empty query → no results.
 */
export async function searchEnvironment(query: string, limit = 8): Promise<SearchResult[]> {
  const text = query.trim();
  if (!text) return [];
  const set = await envSearch().search({ text, limit });
  return set.results.slice(0, limit);
}

export type OperatorIntent = 'diagnose' | 'continue' | 'search' | 'launch-workflow' | 'general';

const DIAGNOSE_RE = /\b(fix|broken|not\s+working|won'?t|why\s+is|error|crash(?:ed|ing)?|overheat|hot|lag|slow|stuck|blank|frozen|fails?)\b/i;
const CONTINUE_RE = /\b(continue|resume|pick\s+up|where\s+i\s+left|restore|reopen)\b/i;
const SEARCH_RE = /\b(find|search|locate|look\s+for|where\s+is|where'?s|show\s+me)\b/i;
const WORKFLOW_RE = /\b(set\s?up|prepare|start|open|launch|workspace|template|environment)\b/i;

/**
 * Lightweight router: map a user query to the operator capability it needs.
 * Order matters — a problem ("why is X broken") wins over retrieval, which wins
 * over a workspace action verb.
 */
export function classifyOperatorIntent(query: string): OperatorIntent {
  const q = query.trim();
  if (!q) return 'general';
  if (DIAGNOSE_RE.test(q)) return 'diagnose';
  if (CONTINUE_RE.test(q)) return 'continue';
  if (SEARCH_RE.test(q)) return 'search';
  if (WORKFLOW_RE.test(q)) return 'launch-workflow';
  return 'general';
}

/**
 * Map the operator briefing onto the system-prompt context shape so prompt
 * builders get project + workflow awareness with one call:
 *   buildSystemPrompt(ukiOperator.toPromptContext())
 */
export function toPromptContext(b: OperatorBriefing = buildOperatorBriefing()): UkiContextSnapshot {
  return {
    foregroundAppId: b.foregroundAppId ?? null,
    openAppIds: b.openAppIds,
    localTime: b.localTime,
    online: b.online,
    activeProjectId: b.activeProjectId,
    activeWorkflows: b.relevantWorkflows.map((w) => w.id),
  };
}

/** Compact, token-bounded prompt block describing the operator's view. */
export function formatOperatorBriefing(b: OperatorBriefing = buildOperatorBriefing(), maxChars = 600): string {
  const lines: string[] = [];
  lines.push(`time: ${b.localTime}${b.online ? '' : ' (offline)'}`);
  if (b.foregroundAppId) lines.push(`foreground: ${b.foregroundAppId}`);
  if (b.openAppIds.length) lines.push(`open: ${b.openAppIds.join(', ')}`);
  if (b.activeProjectId) lines.push(`project: ${b.activeProjectId}`);
  if (b.relevantWorkflows.length) lines.push(`workflows: ${b.relevantWorkflows.map((w) => w.id).join(', ')}`);
  lines.push(`load: ${b.systemPolicy}`);
  const out = lines.join('\n');
  return out.length > maxChars ? out.slice(0, maxChars - 1) + '…' : out;
}
