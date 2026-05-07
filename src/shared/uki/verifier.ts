// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Wave H v4.0.1 - UKI plan verifier, citation tracker, dry-run helpers.

export interface PlanStep { id: string; tool: string; args: Record<string, unknown>; reason: string }

export type RiskLevel = 'safe' | 'caution' | 'destructive';

export interface ToolCatalogEntry { name: string; risk: RiskLevel; requiresConfirmation: boolean; allowedArgs?: string[] }

export interface PlanIssue { stepId: string; severity: 'info' | 'warning' | 'error'; message: string }

export interface VerifiedPlan { ok: boolean; needsConfirmation: boolean; issues: PlanIssue[]; estimatedRisk: RiskLevel }

export function verifyPlan(plan: ReadonlyArray<PlanStep>, catalog: ReadonlyArray<ToolCatalogEntry>): VerifiedPlan {
  const issues: PlanIssue[] = [];
  let needsConfirmation = false;
  let maxRisk: RiskLevel = 'safe';
  const byName = new Map(catalog.map(t => [t.name, t]));
  for (const step of plan) {
    const tool = byName.get(step.tool);
    if (!tool) {
      issues.push({ stepId: step.id, severity: 'error', message: `Unknown tool ${step.tool}.` });
      continue;
    }
    if (tool.requiresConfirmation) needsConfirmation = true;
    if (riskRank(tool.risk) > riskRank(maxRisk)) maxRisk = tool.risk;
    if (tool.allowedArgs) {
      for (const k of Object.keys(step.args)) {
        if (!tool.allowedArgs.includes(k)) {
          issues.push({ stepId: step.id, severity: 'warning', message: `Argument "${k}" not in allowlist for ${step.tool}.` });
        }
      }
    }
    if (!step.reason || step.reason.trim().length < 8) {
      issues.push({ stepId: step.id, severity: 'info', message: 'Step reason too short.' });
    }
  }
  return {
    ok: !issues.some(i => i.severity === 'error'),
    needsConfirmation,
    issues,
    estimatedRisk: maxRisk,
  };
}

function riskRank(r: RiskLevel): number {
  return r === 'safe' ? 0 : r === 'caution' ? 1 : 2;
}

// ---------- Confidence calibration ----------

export interface ConfidenceInputs {
  vectorSimilarity?: number; // 0..1
  citationCount?: number;
  toolErrors?: number;
  retrievalRecallScore?: number; // 0..1
  modelLogprob?: number; // last-token average logprob
  hallucinationFlags?: number;
}

export function calibrateConfidence(inputs: ConfidenceInputs): { confidence: number; rationale: string } {
  let conf = 0.5;
  const reasons: string[] = [];
  if (inputs.vectorSimilarity !== undefined) {
    conf = (conf + inputs.vectorSimilarity) / 2;
    reasons.push(`vec=${inputs.vectorSimilarity.toFixed(2)}`);
  }
  if (inputs.citationCount !== undefined) {
    const boost = Math.min(0.2, inputs.citationCount * 0.05);
    conf += boost;
    reasons.push(`cites=${inputs.citationCount}`);
  }
  if (inputs.toolErrors) {
    conf -= Math.min(0.4, inputs.toolErrors * 0.1);
    reasons.push(`toolErrs=${inputs.toolErrors}`);
  }
  if (inputs.hallucinationFlags) {
    conf -= Math.min(0.5, inputs.hallucinationFlags * 0.2);
    reasons.push(`halluc=${inputs.hallucinationFlags}`);
  }
  if (inputs.retrievalRecallScore !== undefined) {
    conf = conf * 0.7 + inputs.retrievalRecallScore * 0.3;
    reasons.push(`recall=${inputs.retrievalRecallScore.toFixed(2)}`);
  }
  if (inputs.modelLogprob !== undefined) {
    const norm = Math.max(0, Math.min(1, 1 + inputs.modelLogprob / 4));
    conf = conf * 0.8 + norm * 0.2;
    reasons.push(`lp=${inputs.modelLogprob.toFixed(2)}`);
  }
  return { confidence: Math.max(0, Math.min(1, conf)), rationale: reasons.join(' ') };
}

// ---------- Citation tracker ----------

export interface Citation { id: string; sourceUri: string; quotedText: string; offset: number; length: number }

export function findCitations(answer: string, sources: ReadonlyArray<{ uri: string; text: string }>): Citation[] {
  const cites: Citation[] = [];
  let idx = 0;
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(s => s.length > 16);
  for (const sentence of sentences) {
    const cleaned = sentence.replace(/[^\w\s]/g, ' ').trim().toLowerCase();
    const words = cleaned.split(/\s+/).filter(w => w.length > 4).slice(0, 6);
    if (words.length < 3) continue;
    for (const src of sources) {
      const lower = src.text.toLowerCase();
      const found = words.every(w => lower.includes(w));
      if (found) {
        cites.push({
          id: `c${idx++}`,
          sourceUri: src.uri,
          quotedText: sentence.slice(0, 200),
          offset: 0,
          length: sentence.length,
        });
        break;
      }
    }
  }
  return cites;
}

// ---------- Intent matching ----------

export interface IntentDef { name: string; patterns: ReadonlyArray<RegExp | string>; minScore?: number }

export interface IntentMatch { intent: string; score: number; spans: Array<{ start: number; end: number }> }

export function matchIntent(text: string, intents: ReadonlyArray<IntentDef>): IntentMatch | null {
  const lower = text.toLowerCase();
  let best: IntentMatch | null = null;
  for (const it of intents) {
    let score = 0;
    const spans: Array<{ start: number; end: number }> = [];
    for (const p of it.patterns) {
      if (typeof p === 'string') {
        const idx = lower.indexOf(p.toLowerCase());
        if (idx !== -1) { score += 1; spans.push({ start: idx, end: idx + p.length }); }
      } else {
        const m = lower.match(p);
        if (m && m.index !== undefined) { score += 1.5; spans.push({ start: m.index, end: m.index + m[0].length }); }
      }
    }
    const minScore = it.minScore ?? 1;
    if (score >= minScore && (!best || score > best.score)) {
      best = { intent: it.name, score, spans };
    }
  }
  return best;
}

// ---------- Dry-run report ----------

export interface DryRunResult { willMutate: boolean; willCallNetwork: boolean; estimatedCalls: number; toolList: string[] }

export function dryRunPlan(plan: ReadonlyArray<PlanStep>, catalog: ReadonlyArray<ToolCatalogEntry>): DryRunResult {
  const byName = new Map(catalog.map(t => [t.name, t]));
  let willMutate = false;
  let willCallNetwork = false;
  const toolList: string[] = [];
  for (const step of plan) {
    toolList.push(step.tool);
    const t = byName.get(step.tool);
    if (!t) continue;
    if (t.risk !== 'safe') willMutate = true;
    if (/fetch|http|web|api|cloud|sync/i.test(step.tool)) willCallNetwork = true;
  }
  return { willMutate, willCallNetwork, estimatedCalls: plan.length, toolList };
}
