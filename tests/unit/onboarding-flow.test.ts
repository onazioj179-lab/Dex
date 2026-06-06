// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { OnboardingFlow, ONBOARDING_STEPS } from '../../src/shared/onboarding/redesignFlow';

describe('Onboarding redesign flow', () => {
  it('has the 6 spec steps in order', () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      'welcome', 'aiProvider', 'import', 'workspace', 'shortcuts', 'firstWorkflow',
    ]);
  });

  it('advances and tracks progress', () => {
    const f = new OnboardingFlow();
    expect(f.current().id).toBe('welcome');
    expect(f.isFirst()).toBe(true);
    f.next();
    expect(f.current().id).toBe('aiProvider');
    expect(f.progress()).toBeCloseTo(1 / 6, 5);
  });

  it('back() never goes before the first step', () => {
    const f = new OnboardingFlow();
    f.back();
    expect(f.current().id).toBe('welcome');
  });

  it('isComplete only once required steps are done', () => {
    const f = new OnboardingFlow();
    expect(f.isComplete()).toBe(false);
    f.goTo('welcome');
    f.next(); // welcome complete
    f.goTo('workspace');
    f.next(); // workspace complete
    expect(f.isComplete()).toBe(true);
  });

  it('next() stops at the last step', () => {
    const f = new OnboardingFlow();
    for (let i = 0; i < 20; i++) f.next();
    expect(f.isLast()).toBe(true);
    expect(f.current().id).toBe('firstWorkflow');
  });
});
