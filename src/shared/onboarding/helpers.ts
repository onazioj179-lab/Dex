// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Onboarding helpers: changelog parsing, persona quiz, NPS schedule.
 */

// DEX v3.8.9 - onboarding helpers

export interface ChangelogEntry {
  version: string;
  body: string;
}

/**
 * Parse a CHANGELOG.md that uses `## vX.Y.Z` or `## [vX.Y.Z]` headings.
 * Returns entries newest-first.
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = md.split(/\r?\n/);
  let current: ChangelogEntry | null = null;
  for (const line of lines) {
    const m = /^##\s*\[?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\]?/.exec(line);
    if (m) {
      if (current) entries.push(current);
      current = { version: m[1], body: '' };
      continue;
    }
    if (current) current.body += (current.body ? '\n' : '') + line;
  }
  if (current) entries.push(current);
  return entries;
}

export function entryForVersion(entries: ChangelogEntry[], version: string): ChangelogEntry | undefined {
  const v = version.replace(/^v/i, '');
  return entries.find((e) => e.version === v);
}

// ---------- persona quiz ----------

export type Persona = 'writer' | 'developer' | 'designer' | 'researcher' | 'student';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string; weights: Partial<Record<Persona, number>> }>;
}

export const PERSONA_QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'How do you spend most of your day?',
    options: [
      { id: 'q1a', label: 'Writing prose',           weights: { writer: 3, student: 1 } },
      { id: 'q1b', label: 'Writing code',            weights: { developer: 3 } },
      { id: 'q1c', label: 'Designing visuals',       weights: { designer: 3 } },
      { id: 'q1d', label: 'Reading + summarising',   weights: { researcher: 3, student: 2 } },
    ],
  },
  {
    id: 'q2',
    prompt: 'What do you want from DEX first?',
    options: [
      { id: 'q2a', label: 'A clean writing surface', weights: { writer: 2 } },
      { id: 'q2b', label: 'A code workspace',        weights: { developer: 2 } },
      { id: 'q2c', label: 'Image + asset tools',     weights: { designer: 2 } },
      { id: 'q2d', label: 'Notes + research panel',  weights: { researcher: 2, student: 1 } },
    ],
  },
];

export function scorePersona(answers: Record<string, string>, quiz: QuizQuestion[] = PERSONA_QUIZ): Persona {
  const totals: Record<Persona, number> = { writer: 0, developer: 0, designer: 0, researcher: 0, student: 0 };
  for (const q of quiz) {
    const optId = answers[q.id];
    if (!optId) continue;
    const opt = q.options.find((o) => o.id === optId);
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.weights)) {
      totals[k as Persona] += (v as number) ?? 0;
    }
  }
  let best: Persona = 'writer';
  let max = -Infinity;
  for (const p of Object.keys(totals) as Persona[]) {
    if (totals[p] > max) { max = totals[p]; best = p; }
  }
  return best;
}

// ---------- NPS schedule ----------

export interface NpsState {
  firstPromptAt?: number;
  lastPromptAt?: number;
  scores: Array<{ at: number; score: number; comment?: string }>;
}

export function shouldPromptNps(state: NpsState, accountAgeMs: number, now: number = Date.now()): boolean {
  const day = 24 * 60 * 60 * 1000;
  if (!state.firstPromptAt) return accountAgeMs >= 30 * day;
  const last = state.lastPromptAt ?? state.firstPromptAt;
  return now - last >= 90 * day;
}

export function recordNps(state: NpsState, score: number, comment?: string, now: number = Date.now()): NpsState {
  const clamped = Math.max(0, Math.min(10, Math.round(score)));
  return {
    firstPromptAt: state.firstPromptAt ?? now,
    lastPromptAt: now,
    scores: [...state.scores, { at: now, score: clamped, comment }],
  };
}

export function computeNps(state: NpsState): { promoters: number; passives: number; detractors: number; score: number } {
  const counts = { promoters: 0, passives: 0, detractors: 0 };
  for (const s of state.scores) {
    if (s.score >= 9) counts.promoters += 1;
    else if (s.score >= 7) counts.passives += 1;
    else counts.detractors += 1;
  }
  const total = state.scores.length;
  const score = total === 0 ? 0 : Math.round(((counts.promoters - counts.detractors) / total) * 100);
  return { ...counts, score };
}
