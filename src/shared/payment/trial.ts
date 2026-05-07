// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Trial state machine + dunning sequence for failed renewals.
 */

// DEX v3.8.9 - trial + dunning

export type TrialPhase = 'idle' | 'active' | 'expired' | 'converted' | 'cancelled';

export interface TrialState {
  phase: TrialPhase;
  startedAt?: number;
  expiresAt?: number;
}

export const DEFAULT_TRIAL_DAYS = 14;

export function createTrial(): TrialState { return { phase: 'idle' }; }

export function startTrial(state: TrialState, days: number = DEFAULT_TRIAL_DAYS, now: number = Date.now()): TrialState {
  if (state.phase !== 'idle') return state;
  return { phase: 'active', startedAt: now, expiresAt: now + days * 24 * 60 * 60 * 1000 };
}

export function tickTrial(state: TrialState, now: number = Date.now()): TrialState {
  if (state.phase === 'active' && state.expiresAt !== undefined && now >= state.expiresAt) {
    return { ...state, phase: 'expired' };
  }
  return state;
}

export function convertTrial(state: TrialState): TrialState {
  if (state.phase === 'active' || state.phase === 'expired') return { ...state, phase: 'converted' };
  return state;
}

export function cancelTrial(state: TrialState): TrialState {
  if (state.phase === 'active') return { ...state, phase: 'cancelled' };
  return state;
}

export function trialDaysLeft(state: TrialState, now: number = Date.now()): number {
  if (state.phase !== 'active' || state.expiresAt === undefined) return 0;
  return Math.max(0, Math.ceil((state.expiresAt - now) / (24 * 60 * 60 * 1000)));
}

// ---------- dunning ----------

export interface DunningState {
  startedAt: number;
  attempts: Array<{ at: number; ok: boolean; reason?: string }>;
  /** Days from start at which to retry. */
  schedule: number[];
}

export const DEFAULT_DUNNING_SCHEDULE = [0, 3, 7, 14];

export function startDunning(now: number = Date.now(), schedule: number[] = DEFAULT_DUNNING_SCHEDULE): DunningState {
  return { startedAt: now, attempts: [], schedule };
}

export function nextDunningAttempt(state: DunningState, now: number = Date.now()): { dueAt: number | null; isOverdue: boolean } {
  const completed = state.attempts.length;
  if (completed >= state.schedule.length) return { dueAt: null, isOverdue: false };
  const day = state.schedule[completed];
  const dueAt = state.startedAt + day * 24 * 60 * 60 * 1000;
  return { dueAt, isOverdue: now >= dueAt };
}

export function recordDunningAttempt(state: DunningState, attempt: { at?: number; ok: boolean; reason?: string }): DunningState {
  return { ...state, attempts: [...state.attempts, { at: attempt.at ?? Date.now(), ok: attempt.ok, reason: attempt.reason }] };
}

export function dunningDone(state: DunningState): boolean {
  return state.attempts.length >= state.schedule.length || state.attempts.some((a) => a.ok);
}
