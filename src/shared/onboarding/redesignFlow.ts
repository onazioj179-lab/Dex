// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Redesigned onboarding flow (GOAL-6D) — the 6-step state machine targeting a
 * sub-3-minute setup: Welcome -> AI Provider -> Import -> Workspace -> Shortcuts
 * -> First Workflow. Pure progression logic; the wizard UI renders the current
 * step. Required steps gate completion; optional steps can be skipped.
 */

export interface OnboardingStep {
  id: string;
  title: string;
  required: boolean;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 'welcome', title: 'Welcome', required: true },
  { id: 'aiProvider', title: 'Choose AI Provider', required: false },
  { id: 'import', title: 'Import Existing Data', required: false },
  { id: 'workspace', title: 'Choose Default Workspace', required: true },
  { id: 'shortcuts', title: 'Keyboard Shortcuts Tour', required: false },
  { id: 'firstWorkflow', title: 'Create First Workflow', required: false },
];

export class OnboardingFlow {
  private idx = 0;
  private completed = new Set<string>();

  get index(): number {
    return this.idx;
  }

  current(): OnboardingStep {
    return ONBOARDING_STEPS[this.idx];
  }

  isFirst(): boolean {
    return this.idx === 0;
  }

  isLast(): boolean {
    return this.idx === ONBOARDING_STEPS.length - 1;
  }

  /** Mark the current step done and advance (stops at the last step). */
  next(): OnboardingStep {
    this.completed.add(this.current().id);
    if (!this.isLast()) this.idx++;
    return this.current();
  }

  back(): OnboardingStep {
    if (!this.isFirst()) this.idx--;
    return this.current();
  }

  /** Jump to a step by id (no-op if unknown). */
  goTo(id: string): void {
    const i = ONBOARDING_STEPS.findIndex((s) => s.id === id);
    if (i >= 0) this.idx = i;
  }

  /** Fraction of steps completed, 0..1. */
  progress(): number {
    return this.completed.size / ONBOARDING_STEPS.length;
  }

  /** True once every required step is completed. */
  isComplete(): boolean {
    return ONBOARDING_STEPS.every((s) => !s.required || this.completed.has(s.id));
  }
}
