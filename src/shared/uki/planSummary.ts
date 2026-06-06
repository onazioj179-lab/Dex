// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Plan summaries (ROADMAP-600 #003 plan preview, #049 "explain this plan",
 * #020 dry-run). Pure formatting of a decomposed Plan and an ExecResult into
 * human-readable text for a preview/approval surface and a post-run report.
 */

// DEX v6.0 — UKI plan summary

import type { Plan } from './planner';
import type { ExecResult, StepResult } from './actionExecutor';

/** Natural-language preview of what a plan will do, before it runs. */
export function summarizePlan(plan: Plan): string {
  if (plan.steps.length === 0) {
    return `No plan for goal: "${plan.goal}" — not understood.`;
  }
  const n = plan.steps.length;
  const lines = [`Plan for "${plan.goal}" (${n} step${n === 1 ? '' : 's'}):`];
  plan.steps.forEach((s, i) => {
    const deps = s.dependsOn && s.dependsOn.length ? ` after [${s.dependsOn.join(', ')}]` : '';
    const flags = [
      s.optional ? 'optional' : '',
      s.retries ? `retries:${s.retries}` : '',
    ].filter(Boolean).join(', ');
    lines.push(`  ${i + 1}. ${s.actionId}${deps}${flags ? ` (${flags})` : ''}`);
  });
  return lines.join('\n');
}

function glyph(status: StepResult['status']): string {
  return status === 'ok' ? '✓' : status === 'failed' ? '✗' : '–';
}

/** Post-run report: per-step outcome + a one-line headline. */
export function summarizeResult(res: ExecResult): string {
  const ok = res.results.filter((r) => r.status === 'ok').length;
  const failed = res.results.filter((r) => r.status === 'failed').length;
  const skipped = res.results.filter((r) => r.status === 'skipped').length;
  const head = `${res.ok ? 'OK' : 'FAILED'} — ${ok} ok, ${failed} failed, ${skipped} skipped`;
  const lines = [head, ...res.results.map((r) => `  ${glyph(r.status)} ${r.actionId}${r.error ? ` — ${r.error}` : ''}`)];
  return lines.join('\n');
}

/** Counts only — handy for badges / progress without building the full text. */
export function resultCounts(res: ExecResult): { ok: number; failed: number; skipped: number; total: number } {
  let ok = 0; let failed = 0; let skipped = 0;
  for (const r of res.results) {
    if (r.status === 'ok') ok += 1;
    else if (r.status === 'failed') failed += 1;
    else skipped += 1;
  }
  return { ok, failed, skipped, total: res.results.length };
}
