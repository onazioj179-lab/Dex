// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Step state machine (onboarding flows, setup wizards, the automation builder).
 * A pure, immutable cursor over an ordered list of steps with next/prev/goTo and
 * progress reporting. `index === steps.length` means "complete". Pure: no DOM.
 */

export interface StepState {
  steps: readonly string[];
  index: number;
}

/** Create a machine at the first step. */
export function createSteps(steps: readonly string[]): StepState {
  return { steps, index: steps.length === 0 ? 0 : 0 };
}

function clampIndex(state: StepState, index: number): number {
  return Math.min(state.steps.length, Math.max(0, index));
}

/** Advance one step (caps at completion = steps.length). */
export function next(state: StepState): StepState {
  return { ...state, index: clampIndex(state, state.index + 1) };
}

/** Go back one step (caps at 0). */
export function prev(state: StepState): StepState {
  return { ...state, index: clampIndex(state, state.index - 1) };
}

/** Jump to a specific step index. */
export function goTo(state: StepState, index: number): StepState {
  return { ...state, index: clampIndex(state, index) };
}

/** The current step id, or null when complete/empty. */
export function currentStep(state: StepState): string | null {
  return state.index < state.steps.length ? state.steps[state.index] : null;
}

export function isFirst(state: StepState): boolean {
  return state.index === 0;
}

export function isLast(state: StepState): boolean {
  return state.steps.length > 0 && state.index === state.steps.length - 1;
}

export function isComplete(state: StepState): boolean {
  return state.steps.length === 0 || state.index >= state.steps.length;
}

/** Progress 0..1 across the steps. */
export function progress(state: StepState): number {
  if (state.steps.length === 0) return 1;
  return Math.min(1, state.index / state.steps.length);
}
