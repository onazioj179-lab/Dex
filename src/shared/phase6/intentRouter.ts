// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 6 - Search + Semantic desktop intent router.
 *
 * Sits above the Phase 1 SearchOrchestrator: classifies free-text queries
 * into typed intents (open app, run command, find file, ask UKI, calc, web)
 * before search providers dispatch.
 */

export type IntentKind =
  | 'open-app'
  | 'run-command'
  | 'find-file'
  | 'ask-uki'
  | 'web-search'
  | 'calculate'
  | 'navigate-setting'
  | 'unknown';

export interface ClassifiedIntent {
  readonly kind: IntentKind;
  readonly confidence: number;
  readonly args: Readonly<Record<string, string>>;
  readonly matchedRule?: string;
}

export interface IntentRule {
  readonly id: string;
  readonly kind: IntentKind;
  readonly pattern: RegExp;
  readonly extract?: (m: RegExpMatchArray) => Record<string, string>;
  readonly weight?: number;
}

const DEFAULT_RULES: IntentRule[] = [
  { id: 'calc-arith', kind: 'calculate', pattern: /^\s*(?:=|calc(?:ulate)?\s+)?([0-9.\s+\-*/()%]+)\s*$/i,
    extract: (m) => ({ expression: (m[1] ?? '').trim() }), weight: 0.95 },
  { id: 'open-app', kind: 'open-app', pattern: /^\s*(?:open|launch|run)\s+(.+?)\s*$/i,
    extract: (m) => ({ app: (m[1] ?? '').trim() }), weight: 0.9 },
  { id: 'find-file', kind: 'find-file', pattern: /^\s*(?:find|search)\s+(?:file|files)\s+(.+?)\s*$/i,
    extract: (m) => ({ query: (m[1] ?? '').trim() }), weight: 0.9 },
  { id: 'ask-uki', kind: 'ask-uki', pattern: /^\s*(?:\?|(?:ask|why|how|what|when|who|where)\b)\s*(.*)$/i,
    extract: (m) => ({ question: (m[1] ?? '').trim() }), weight: 0.7 },
  { id: 'web-search', kind: 'web-search', pattern: /^\s*(?:web|google|search)\s+(.+?)\s*$/i,
    extract: (m) => ({ query: (m[1] ?? '').trim() }), weight: 0.85 },
  { id: 'navigate-setting', kind: 'navigate-setting', pattern: /^\s*(?:settings?|prefs?|preferences?)\s*[:>]\s*(.+?)\s*$/i,
    extract: (m) => ({ path: (m[1] ?? '').trim() }), weight: 0.85 },
  { id: 'run-command', kind: 'run-command', pattern: /^\s*[/>]\s*(.+?)\s*$/,
    extract: (m) => ({ command: (m[1] ?? '').trim() }), weight: 0.9 },
];

export class IntentRouter {
  private readonly rules: IntentRule[];

  constructor(extraRules: readonly IntentRule[] = []) {
    this.rules = [...DEFAULT_RULES, ...extraRules];
    const seen = new Set<string>();
    for (const r of this.rules) {
      if (seen.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
      seen.add(r.id);
    }
  }

  register(rule: IntentRule): void {
    if (this.rules.some((r) => r.id === rule.id)) throw new Error(`duplicate rule id ${rule.id}`);
    this.rules.push(rule);
  }

  classify(text: string): ClassifiedIntent {
    if (!text || !text.trim()) return { kind: 'unknown', confidence: 0, args: {} };
    let best: ClassifiedIntent = { kind: 'unknown', confidence: 0, args: {} };
    for (const rule of this.rules) {
      const m = text.match(rule.pattern);
      if (!m) continue;
      const args = rule.extract ? rule.extract(m) : {};
      const confidence = rule.weight ?? 0.5;
      if (confidence > best.confidence) {
        best = { kind: rule.kind, confidence, args, matchedRule: rule.id };
      }
    }
    return best;
  }

  classifyAll(text: string): ClassifiedIntent[] {
    if (!text || !text.trim()) return [];
    const out: ClassifiedIntent[] = [];
    for (const rule of this.rules) {
      const m = text.match(rule.pattern);
      if (!m) continue;
      out.push({
        kind: rule.kind,
        confidence: rule.weight ?? 0.5,
        args: rule.extract ? rule.extract(m) : {},
        matchedRule: rule.id,
      });
    }
    out.sort((a, b) => b.confidence - a.confidence);
    return out;
  }

  ruleCount(): number { return this.rules.length; }
}
