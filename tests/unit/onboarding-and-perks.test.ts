// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// DEX v3.8.9 - onboarding flow + pro perks tests

import { describe, it, expect } from 'vitest';
import {
  initialFlowState,
  advanceFlow,
  validateSignUp,
  validateSignIn,
  shouldShowReminder,
  canPerformCloudAction,
} from '../../src/shared/account/onboardingFlow';
import {
  PRO_PERKS,
  checkPerk,
  lockedPerks,
  unlockedPerks,
} from '../../src/shared/license/proPerks';

describe('Onboarding flow', () => {
  it('starts on welcome', () => {
    expect(initialFlowState().screen).toBe('welcome');
  });

  it('welcome -> choose -> sign-in path', () => {
    let s = initialFlowState();
    s = advanceFlow(s, { kind: 'continue-from-welcome' });
    expect(s.screen).toBe('choose');
    s = advanceFlow(s, { kind: 'pick-sign-in' });
    expect(s.screen).toBe('sign-in');
  });

  it('skip path schedules a 7-day reminder', () => {
    const s = advanceFlow(initialFlowState(), { kind: 'skip-for-now', now: 0 });
    expect(s.screen).toBe('skipped');
    expect(s.remindLaterUntil).toBe(7 * 24 * 60 * 60 * 1000);
    expect(shouldShowReminder(s, s.remindLaterUntil + 1)).toBe(true);
    expect(shouldShowReminder(s, s.remindLaterUntil - 1)).toBe(false);
  });

  it('validateSignUp catches every required failure', () => {
    const errs = validateSignUp({ email: 'bad', displayName: 'a', password: 'short', acceptedTerms: false, acceptedPrivacy: false });
    expect(errs.email).toBeDefined();
    expect(errs.displayName).toBeDefined();
    expect(errs.password).toBeDefined();
    expect(errs.terms).toBeDefined();
    expect(errs.privacy).toBeDefined();
  });

  it('validateSignUp passes a clean form', () => {
    const errs = validateSignUp({ email: 'u@example.com', displayName: 'Onazi', password: 'CorrectHorse9!', acceptedTerms: true, acceptedPrivacy: true });
    expect(errs).toEqual({});
  });

  it('validateSignUp blocks disposable email', () => {
    const errs = validateSignUp({ email: 'u@mailinator.com', displayName: 'Onazi', password: 'CorrectHorse9!', acceptedTerms: true, acceptedPrivacy: true });
    expect(errs.email).toMatch(/disposable/i);
  });

  it('submit-sign-up rejects invalid form (errors set, screen unchanged)', () => {
    let s = advanceFlow(initialFlowState(), { kind: 'pick-sign-up' });
    s = advanceFlow(s, { kind: 'submit-sign-up', email: 'bad', displayName: '', password: '' });
    expect(s.screen).toBe('sign-up');
    expect(Object.keys(s.errors).length).toBeGreaterThan(0);
  });

  it('submit-sign-up succeeds when valid + terms accepted', () => {
    let s = initialFlowState();
    s = advanceFlow(s, { kind: 'pick-sign-up' });
    s = advanceFlow(s, { kind: 'accept-terms' });
    s = advanceFlow(s, { kind: 'accept-privacy' });
    s = advanceFlow(s, { kind: 'submit-sign-up', email: 'user@example.com', displayName: 'Onazi', password: 'CorrectHorse9!' });
    expect(s.screen).toBe('success');
    expect(s.email).toBe('user@example.com');
  });

  it('submit-sign-in routes to terms when not accepted', () => {
    let s = initialFlowState();
    s = advanceFlow(s, { kind: 'pick-sign-in' });
    s = advanceFlow(s, { kind: 'submit-sign-in', email: 'u@x.com', password: 'whatever' });
    expect(s.screen).toBe('terms');
  });

  it('submit-sign-in advances to two-factor when terms accepted', () => {
    let s = initialFlowState();
    s = advanceFlow(s, { kind: 'accept-terms' });
    s = advanceFlow(s, { kind: 'accept-privacy' });
    s = advanceFlow(s, { kind: 'submit-sign-in', email: 'u@x.com', password: 'whatever' });
    expect(s.screen).toBe('two-factor');
  });

  it('two-factor passed -> success', () => {
    let s = initialFlowState();
    s = advanceFlow(s, { kind: 'two-factor-required' });
    s = advanceFlow(s, { kind: 'two-factor-passed' });
    expect(s.screen).toBe('success');
  });

  it('canPerformCloudAction blocks until terms+privacy accepted', () => {
    expect(canPerformCloudAction(initialFlowState()).allowed).toBe(false);
    let s = advanceFlow(initialFlowState(), { kind: 'accept-terms' });
    expect(canPerformCloudAction(s).reason).toBe('privacy');
    s = advanceFlow(s, { kind: 'accept-privacy' });
    expect(canPerformCloudAction(s).allowed).toBe(true);
  });

  it('reset returns to welcome', () => {
    let s = advanceFlow(initialFlowState(), { kind: 'pick-sign-up' });
    s = advanceFlow(s, { kind: 'reset' });
    expect(s.screen).toBe('welcome');
  });

  it('validateSignIn catches missing fields', () => {
    expect(validateSignIn({ email: '', password: '' }).email).toBeDefined();
    expect(validateSignIn({ email: 'u@x.com', password: '' }).password).toBeDefined();
  });
});

describe('Pro perks', () => {
  it('every perk has the required fields', () => {
    for (const p of PRO_PERKS) {
      expect(p.gate).toBeDefined();
      expect(p.headline).toBeTruthy();
      expect(p.blurb).toBeTruthy();
      expect(p.minPlan).toBeDefined();
      expect(p.category).toBeDefined();
    }
  });

  it('Free Viewer cannot use unlimited-uki', () => {
    const r = checkPerk({ currentPlan: 'free-viewer', gate: 'unlimited-uki' });
    expect(r.allowed).toBe(false);
    expect(r.upgradeTo).toBe('personal');
  });

  it('Personal unlocks 100 GB storage and E2EE', () => {
    expect(checkPerk({ currentPlan: 'personal', gate: 'storage-100gb' }).allowed).toBe(true);
    expect(checkPerk({ currentPlan: 'personal', gate: 'e2ee-passphrase' }).allowed).toBe(true);
  });

  it('Pro unlocks commercial use and pro model; Personal does not', () => {
    expect(checkPerk({ currentPlan: 'personal', gate: 'commercial-use' }).allowed).toBe(false);
    expect(checkPerk({ currentPlan: 'pro', gate: 'commercial-use' }).allowed).toBe(true);
    expect(checkPerk({ currentPlan: 'pro', gate: 'pro-model' }).allowed).toBe(true);
  });

  it('Studio is the only path to admin console + SLA', () => {
    expect(checkPerk({ currentPlan: 'pro', gate: 'admin-console' }).allowed).toBe(false);
    expect(checkPerk({ currentPlan: 'studio', gate: 'admin-console' }).allowed).toBe(true);
    expect(checkPerk({ currentPlan: 'studio', gate: 'sla' }).allowed).toBe(true);
  });

  it('lockedPerks shrinks as plan increases', () => {
    const free = lockedPerks('free-viewer').length;
    const personal = lockedPerks('personal').length;
    const pro = lockedPerks('pro').length;
    const studio = lockedPerks('studio').length;
    expect(free).toBeGreaterThan(personal);
    expect(personal).toBeGreaterThan(pro);
    expect(pro).toBeGreaterThan(studio);
    expect(studio).toBe(0);
  });

  it('unlockedPerks grows as plan increases', () => {
    expect(unlockedPerks('free-viewer').length).toBeLessThan(unlockedPerks('personal').length);
    expect(unlockedPerks('personal').length).toBeLessThan(unlockedPerks('pro').length);
    expect(unlockedPerks('pro').length).toBeLessThan(unlockedPerks('studio').length);
  });

  it('checkPerk throws on unknown gate', () => {
    expect(() => checkPerk({ currentPlan: 'pro', gate: 'nonexistent' as never })).toThrow();
  });
});
