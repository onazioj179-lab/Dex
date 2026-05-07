// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI intelligence polish — wave L.
 *
 * Pure primitives that make the assistant feel smarter:
 *  - Confidence calibration tracker (rolling Brier-like score)
 *  - Plan diff (what would change if I run this?)
 *  - Skill suggestions from selection text (intent-matchers)
 *  - Multi-step undo log with bounded history
 *  - Pattern decay so unused habits get forgotten (>30d)
 *  - Suggestion-acceptance bandit (epsilon-greedy)
 *
 * No DOM, no React, no IPC. Tests pin clocks and randomness.
 */

// DEX v3.8.9 wave L - uki intelligence

// -------- confidence calibration -------------------------------------

export interface CalibrationSample {
  /** Predicted confidence in [0,1] before the action ran. */
  predicted: number;
  /** True if user accepted / action succeeded. */
  correct: boolean;
}

export interface CalibrationState {
  samples: CalibrationSample[];
  /** Hard cap on retained samples (rolling window). */
  capacity: number;
}

export const CALIBRATION_CAPACITY = 200 as const;

export function newCalibration(capacity: number = CALIBRATION_CAPACITY): CalibrationState {
  return { samples: [], capacity: Math.max(1, capacity) };
}

export function recordCalibration(state: CalibrationState, sample: CalibrationSample): CalibrationState {
  const samples = [...state.samples, sample];
  if (samples.length > state.capacity) samples.splice(0, samples.length - state.capacity);
  return { ...state, samples };
}

/**
 * Mean Brier score (lower = better calibration). Range: [0,1].
 * Returns null when there are fewer than 5 samples.
 */
export function brierScore(state: CalibrationState): number | null {
  if (state.samples.length < 5) return null;
  let sum = 0;
  for (const s of state.samples) {
    const outcome = s.correct ? 1 : 0;
    const diff = s.predicted - outcome;
    sum += diff * diff;
  }
  return sum / state.samples.length;
}

/**
 * Suggest a calibration adjustment in [-0.3, +0.3]. Negative means the
 * model is over-confident (predicted > observed accuracy) so future
 * predictions should be scaled down.
 */
export function calibrationBias(state: CalibrationState): number {
  if (state.samples.length < 5) return 0;
  const meanPred = state.samples.reduce((acc, s) => acc + s.predicted, 0) / state.samples.length;
  const meanObs = state.samples.reduce((acc, s) => acc + (s.correct ? 1 : 0), 0) / state.samples.length;
  const raw = meanObs - meanPred;
  return Math.max(-0.3, Math.min(0.3, raw));
}

// -------- plan diff --------------------------------------------------

export interface PlanStep {
  id: string;
  /** Skill or action id, e.g. "files.move", "notes.summarise". */
  action: string;
  /** Display label. */
  label: string;
  /** Reversibility — used for confirm prompts. */
  reversible: boolean;
  /** Resources touched (paths, doc ids, etc.). */
  affects: string[];
}

export interface PlanDiff {
  added: PlanStep[];
  removed: PlanStep[];
  reordered: { id: string; from: number; to: number }[];
  /** True when plan touches an irreversible step. */
  hasDestructive: boolean;
}

/** Diff two plans by step id, preserving order semantics. */
export function diffPlans(prev: readonly PlanStep[], next: readonly PlanStep[]): PlanDiff {
  const prevIds = new Set(prev.map((s) => s.id));
  const nextIds = new Set(next.map((s) => s.id));
  const added = next.filter((s) => !prevIds.has(s.id));
  const removed = prev.filter((s) => !nextIds.has(s.id));
  const reordered: { id: string; from: number; to: number }[] = [];
  for (let i = 0; i < next.length; i++) {
    const s = next[i];
    if (!prevIds.has(s.id)) continue;
    const prevIndex = prev.findIndex((p) => p.id === s.id);
    if (prevIndex !== i) reordered.push({ id: s.id, from: prevIndex, to: i });
  }
  const hasDestructive = next.some((s) => !s.reversible);
  return { added, removed, reordered, hasDestructive };
}

// -------- skill suggestions from selection ---------------------------

export interface SkillMatcher {
  skillId: string;
  /** Lowercase keyword triggers. Any match counts. */
  keywords: readonly string[];
  /** Optional regex; when present, must match. */
  regex?: RegExp;
  /** Base score (1..100). */
  baseScore: number;
}

export interface SkillSuggestion {
  skillId: string;
  score: number;
  /** Which keyword(s) triggered the match. */
  matched: string[];
}

/**
 * Score skills against a selection. Returns suggestions with score > 0
 * sorted desc. Pure: no global state, no DOM.
 */
export function suggestSkills(selection: string, matchers: readonly SkillMatcher[]): SkillSuggestion[] {
  const text = selection.toLowerCase();
  if (text.trim() === '') return [];
  const out: SkillSuggestion[] = [];
  for (const m of matchers) {
    if (m.regex && !m.regex.test(selection)) continue;
    const matched: string[] = [];
    for (const kw of m.keywords) {
      if (text.includes(kw.toLowerCase())) matched.push(kw);
    }
    if (matched.length === 0 && !m.regex) continue;
    const score = m.baseScore + matched.length * 10;
    out.push({ skillId: m.skillId, score, matched });
  }
  return out.sort((a, b) => b.score - a.score);
}

// -------- multi-step undo log ---------------------------------------

export interface UndoEntry {
  id: string;
  /** ms epoch */
  recordedAt: number;
  label: string;
  /** Opaque payload the executor uses to reverse the step. */
  payload: unknown;
}

export interface UndoLog {
  entries: UndoEntry[];
  capacity: number;
}

export const UNDO_LOG_CAPACITY = 100 as const;

export function newUndoLog(capacity: number = UNDO_LOG_CAPACITY): UndoLog {
  return { entries: [], capacity: Math.max(1, capacity) };
}

export function pushUndo(log: UndoLog, entry: UndoEntry): UndoLog {
  const entries = [...log.entries, entry];
  if (entries.length > log.capacity) entries.splice(0, entries.length - log.capacity);
  return { ...log, entries };
}

export function popUndo(log: UndoLog): { log: UndoLog; entry: UndoEntry | null } {
  if (log.entries.length === 0) return { log, entry: null };
  const entries = log.entries.slice(0, -1);
  return { log: { ...log, entries }, entry: log.entries[log.entries.length - 1] };
}

/** Most recent N entries for a "Recent actions" panel. */
export function recentUndos(log: UndoLog, count: number): UndoEntry[] {
  return log.entries.slice(-Math.max(0, count)).reverse();
}

// -------- pattern decay ---------------------------------------------

export interface UsagePattern {
  patternId: string;
  /** ms epoch when last seen. */
  lastSeenAt: number;
  /** Total observations. */
  count: number;
}

export const PATTERN_DECAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Drop patterns unused for more than `staleMs` (default 30d). */
export function decayPatterns(
  patterns: readonly UsagePattern[],
  now: number,
  staleMs: number = PATTERN_DECAY_MS
): UsagePattern[] {
  return patterns.filter((p) => now - p.lastSeenAt < staleMs);
}

/** Increment-or-create a pattern entry. */
export function recordPattern(
  patterns: readonly UsagePattern[],
  patternId: string,
  now: number
): UsagePattern[] {
  const existing = patterns.find((p) => p.patternId === patternId);
  if (existing) {
    return patterns.map((p) =>
      p.patternId === patternId ? { ...p, lastSeenAt: now, count: p.count + 1 } : p
    );
  }
  return [...patterns, { patternId, lastSeenAt: now, count: 1 }];
}

// -------- suggestion bandit (epsilon-greedy) -------------------------

export interface BanditArm {
  armId: string;
  /** Total times this arm was offered. */
  trials: number;
  /** Times the user accepted it. */
  rewards: number;
}

export interface BanditState {
  arms: Record<string, BanditArm>;
  /** Exploration rate in [0,1]. */
  epsilon: number;
}

export function newBandit(epsilon: number = 0.1): BanditState {
  const e = Math.max(0, Math.min(1, epsilon));
  return { arms: {}, epsilon: e };
}

export function ensureArm(state: BanditState, armId: string): BanditState {
  if (state.arms[armId]) return state;
  return { ...state, arms: { ...state.arms, [armId]: { armId, trials: 0, rewards: 0 } } };
}

/** Mean reward (acceptance rate). New arms return 0.5 (optimistic). */
export function armScore(arm: BanditArm | undefined): number {
  if (!arm || arm.trials === 0) return 0.5;
  return arm.rewards / arm.trials;
}

/**
 * Pick an arm. With probability epsilon, explore uniformly at random;
 * otherwise pick the arm with the highest mean reward.
 * Pure: takes `random()` for determinism.
 */
export function selectArm(
  state: BanditState,
  candidates: readonly string[],
  random: () => number = Math.random
): string | null {
  if (candidates.length === 0) return null;
  if (random() < state.epsilon) {
    const idx = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return candidates[idx];
  }
  let bestId = candidates[0];
  let bestScore = armScore(state.arms[bestId]);
  for (let i = 1; i < candidates.length; i++) {
    const id = candidates[i];
    const s = armScore(state.arms[id]);
    if (s > bestScore) {
      bestScore = s;
      bestId = id;
    }
  }
  return bestId;
}

export function recordOutcome(state: BanditState, armId: string, accepted: boolean): BanditState {
  const next = ensureArm(state, armId);
  const arm = next.arms[armId];
  const updated: BanditArm = {
    ...arm,
    trials: arm.trials + 1,
    rewards: arm.rewards + (accepted ? 1 : 0),
  };
  return { ...next, arms: { ...next.arms, [armId]: updated } };
}
