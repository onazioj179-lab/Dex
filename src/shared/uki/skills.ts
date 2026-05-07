// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI skill registry. A Skill couples an intent matcher to a plan template.
 * Skills are pure data — registration / matching is the only logic here.
 */

// DEX v3.8.9 - UKI brain: skills

export interface PlanStepTemplate {
  actionId: string;
  params: Record<string, unknown>;
  dependsOn?: string[];
  optional?: boolean;
  retries?: number;
}

export interface PlanTemplate {
  steps: PlanStepTemplate[];
}

export interface Skill {
  id: string;
  label: string;
  /** Intent matcher: substring (case-insensitive) or regex. */
  intent: string | RegExp;
  /** Required fact keys that must appear in PlanContext.facts. */
  requiredContext?: string[];
  /** App ids this skill is scoped to (empty = global). */
  appIds?: string[];
  plan: PlanTemplate;
}

export interface SkillRegistry {
  skills: Skill[];
}

export function createSkillRegistry(): SkillRegistry { return { skills: [] }; }

export function registerSkill(reg: SkillRegistry, skill: Skill): SkillRegistry {
  if (!skill.id) throw new Error('skill.id required');
  if (reg.skills.some((s) => s.id === skill.id)) {
    return { skills: reg.skills.map((s) => s.id === skill.id ? skill : s) };
  }
  return { skills: [...reg.skills, skill] };
}

export function unregisterSkill(reg: SkillRegistry, id: string): SkillRegistry {
  return { skills: reg.skills.filter((s) => s.id !== id) };
}

export interface MatchOptions {
  appId?: string;
  facts?: Record<string, unknown>;
  /** Maximum results. Default 5. */
  limit?: number;
}

export interface RankedSkill {
  skill: Skill;
  score: number;
  /** Required-context keys that are missing (skill cannot run yet). */
  missingContext: string[];
}

/**
 * Rank skills by intent strength + context availability + app scope.
 * Returns highest-scoring first. Negative-score skills are dropped.
 */
export function matchSkills(
  intent: string,
  reg: SkillRegistry,
  opts: MatchOptions = {},
): RankedSkill[] {
  const lower = (intent ?? '').toLowerCase().trim();
  if (!lower) return [];
  const limit = opts.limit ?? 5;
  const facts = opts.facts ?? {};
  const ranked: RankedSkill[] = [];
  for (const s of reg.skills) {
    let score = 0;
    if (typeof s.intent === 'string') {
      const needle = s.intent.toLowerCase();
      if (lower === needle) score += 20;
      else if (lower.includes(needle)) score += 10;
    } else {
      const m = s.intent.exec(lower);
      if (m) score += 12 + Math.min(m[0].length, 8);
    }
    if (s.appIds && s.appIds.length > 0) {
      if (opts.appId && s.appIds.includes(opts.appId)) score += 5;
      else if (opts.appId) continue; // hard exclude wrong-app skills when an appId is given
    }
    const missing = (s.requiredContext ?? []).filter((k) => !(k in facts));
    if (missing.length === 0 && (s.requiredContext ?? []).length > 0) score += 2;
    score -= missing.length * 3;
    if (score > 0) ranked.push({ skill: s, score, missingContext: missing });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

/** Find a skill by id. */
export function getSkill(reg: SkillRegistry, id: string): Skill | undefined {
  return reg.skills.find((s) => s.id === id);
}
