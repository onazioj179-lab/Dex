// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Account onboarding flow logic
 * -----------------------------------------------------------------------------
 * Pure state machine for the welcome / sign-in / sign-up / skip / terms-gate
 * flow. The renderer's <AccountAuthFlow /> wraps this and renders one screen
 * at a time. Keeping the flow pure means we can unit-test every branch
 * without spinning up React or Electron.
 *
 * Hard rules (per Terms of Service):
 *   1. The user CAN skip account creation entirely. Skipping does not
 *      reduce app capability for the local-only experience.
 *   2. Terms + Privacy MUST be accepted before any cloud-bound action
 *      (sign-up, sign-in, payment, sync). Skipping the flow does NOT
 *      auto-accept; if the user later tries to sign in, the gate fires.
 *   3. Sign-up requires plausible email + acceptable password + terms.
 *   4. The "remind me later" path schedules a soft prompt 7 days later.
 */

// DEX v3.8.9 - account onboarding flow

import { isProbablyValidEmail, isDisposableEmail } from '../security/abusePrevention';

export type FlowScreen =
  | 'welcome'
  | 'choose'         // sign-in vs sign-up vs skip
  | 'sign-in'
  | 'sign-up'
  | 'terms'          // shown before sign-in/up commits
  | 'two-factor'     // optional TOTP step
  | 'skipped'        // user picked "use without account"
  | 'success';

export interface FlowState {
  screen: FlowScreen;
  email: string;
  displayName: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  wantsAnalytics: boolean;
  wantsCrashReports: boolean;
  remindLaterUntil: number;     // 0 = no pending reminder
  errors: Record<string, string>;
}

export function initialFlowState(): FlowState {
  return {
    screen: 'welcome',
    email: '',
    displayName: '',
    acceptedTerms: false,
    acceptedPrivacy: false,
    wantsAnalytics: false,
    wantsCrashReports: false,
    remindLaterUntil: 0,
    errors: {},
  };
}

const REMIND_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/** Validate sign-up form fields. Returns errors keyed by field name. */
export function validateSignUp(input: {
  email: string;
  displayName: string;
  password: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isProbablyValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  else if (isDisposableEmail(input.email)) errors.email = 'Disposable email addresses are not accepted.';
  if (!input.displayName || input.displayName.trim().length < 2) errors.displayName = 'Display name must be at least 2 characters.';
  if (input.displayName.length > 60) errors.displayName = 'Display name is too long.';
  if (!input.password || input.password.length < 12) errors.password = 'Password must be at least 12 characters.';
  if (input.password && /^(.)\1+$/.test(input.password)) errors.password = 'Password is too simple.';
  if (!input.acceptedTerms) errors.terms = 'You must accept the Terms of Service.';
  if (!input.acceptedPrivacy) errors.privacy = 'You must accept the Privacy Notice.';
  return errors;
}

/** Validate sign-in form fields. */
export function validateSignIn(input: { email: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isProbablyValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (!input.password || input.password.length === 0) errors.password = 'Enter your password.';
  return errors;
}

export type FlowEvent =
  | { kind: 'continue-from-welcome' }
  | { kind: 'pick-sign-in' }
  | { kind: 'pick-sign-up' }
  | { kind: 'skip-for-now'; now?: number }
  | { kind: 'open-terms' }
  | { kind: 'accept-terms' }
  | { kind: 'accept-privacy' }
  | { kind: 'submit-sign-in'; email: string; password: string }
  | { kind: 'submit-sign-up'; email: string; displayName: string; password: string }
  | { kind: 'two-factor-required' }
  | { kind: 'two-factor-passed' }
  | { kind: 'reset' };

/** Advance the flow by one event. Pure. */
export function advanceFlow(state: FlowState, event: FlowEvent): FlowState {
  switch (event.kind) {
    case 'continue-from-welcome':
      return { ...state, screen: 'choose' };
    case 'pick-sign-in':
      return { ...state, screen: 'sign-in', errors: {} };
    case 'pick-sign-up':
      return { ...state, screen: 'sign-up', errors: {} };
    case 'skip-for-now': {
      const now = event.now ?? Date.now();
      return {
        ...state,
        screen: 'skipped',
        remindLaterUntil: now + REMIND_DELAY_MS,
      };
    }
    case 'open-terms':
      return { ...state, screen: 'terms' };
    case 'accept-terms':
      return { ...state, acceptedTerms: true };
    case 'accept-privacy':
      return { ...state, acceptedPrivacy: true };
    case 'submit-sign-in': {
      const errors = validateSignIn(event);
      if (Object.keys(errors).length > 0) return { ...state, errors };
      if (!state.acceptedTerms || !state.acceptedPrivacy) {
        return { ...state, screen: 'terms', errors: { terms: 'Please accept Terms and Privacy first.' } };
      }
      return { ...state, email: event.email, errors: {}, screen: 'two-factor' };
    }
    case 'submit-sign-up': {
      const errors = validateSignUp({
        email: event.email,
        displayName: event.displayName,
        password: event.password,
        acceptedTerms: state.acceptedTerms,
        acceptedPrivacy: state.acceptedPrivacy,
      });
      if (Object.keys(errors).length > 0) return { ...state, errors };
      return {
        ...state,
        email: event.email,
        displayName: event.displayName,
        errors: {},
        screen: 'success',
      };
    }
    case 'two-factor-required':
      return { ...state, screen: 'two-factor' };
    case 'two-factor-passed':
      return { ...state, screen: 'success', errors: {} };
    case 'reset':
      return initialFlowState();
  }
}

/** Should we show the soft "create account" reminder? */
export function shouldShowReminder(state: FlowState, now: number = Date.now()): boolean {
  if (state.screen === 'success') return false;
  return state.remindLaterUntil > 0 && now >= state.remindLaterUntil;
}

/** Cloud action gate: refuses if Terms / Privacy not accepted. */
export function canPerformCloudAction(state: FlowState): { allowed: boolean; reason?: 'terms' | 'privacy' } {
  if (!state.acceptedTerms) return { allowed: false, reason: 'terms' };
  if (!state.acceptedPrivacy) return { allowed: false, reason: 'privacy' };
  return { allowed: true };
}
