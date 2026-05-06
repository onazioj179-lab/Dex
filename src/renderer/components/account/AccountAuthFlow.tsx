// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AccountAuthFlow -- the polished account UI from welcome through success.
 * -----------------------------------------------------------------------------
 * Pulls all flow logic from `shared/account/onboardingFlow` so this file is
 * pure presentation. Five surfaces in one component:
 *
 *   welcome  -> sales pitch + Continue
 *   choose   -> Sign in / Create account / Skip for now (recommended path
 *               varies by user state)
 *   sign-in  -> email + password + remember + 2FA hint
 *   sign-up  -> email + display name + password + terms+privacy gate
 *   terms    -> hard gate before any cloud action
 *   two-factor -> 6-digit code
 *   skipped  -> "you can sign in later from Settings -> Account"
 *   success  -> welcome + next steps
 *
 * Every surface uses the shared <Button /> and <TextInput /> primitives so
 * the visual system stays consistent across the entire app.
 */

// DEX v3.8.9 - account auth flow UI

import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/TextInput';
import { space, radius, fontSize } from '../../styles/tokens';
import {
  initialFlowState,
  advanceFlow,
  type FlowState,
  type FlowEvent,
} from '../../../shared/account/onboardingFlow';

export interface AccountAuthFlowProps {
  /** Called once the user has finished (success | skipped). */
  onComplete?(result: { mode: 'signed-in' | 'signed-up' | 'skipped'; email?: string }): void;
  /** Show the welcome screen first. Set false when launched from Settings. */
  showWelcome?: boolean;
}

const card: React.CSSProperties = {
  width: 'min(440px, 92vw)',
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: radius.lg,
  padding: space[6],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
};

const heading: React.CSSProperties = { fontSize: fontSize.xl, fontWeight: 600, margin: 0 };
const body: React.CSSProperties = { fontSize: fontSize.sm, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', margin: 0, lineHeight: 1.5 };
const errorText: React.CSSProperties = { color: 'var(--color-error, #FF453A)', fontSize: fontSize.xs, margin: 0 };
const fieldRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: space[1] };
const tilesRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: space[3] };

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))' }}>{children}</label>;
}

export function AccountAuthFlow({ onComplete, showWelcome = true }: AccountAuthFlowProps) {
  const [state, setState] = useState<FlowState>(() => {
    const init = initialFlowState();
    return showWelcome ? init : advanceFlow(init, { kind: 'continue-from-welcome' });
  });

  const dispatch = useCallback((ev: FlowEvent) => {
    setState((prev) => {
      const next = advanceFlow(prev, ev);
      if (next.screen === 'success' && prev.screen !== 'success') {
        onComplete?.({ mode: ev.kind === 'submit-sign-up' ? 'signed-up' : 'signed-in', email: next.email });
      }
      if (next.screen === 'skipped' && prev.screen !== 'skipped') {
        onComplete?.({ mode: 'skipped' });
      }
      return next;
    });
  }, [onComplete]);

  switch (state.screen) {
    case 'welcome':       return <WelcomeScreen card={card} onContinue={() => dispatch({ kind: 'continue-from-welcome' })} />;
    case 'choose':        return <ChooseScreen card={card} dispatch={dispatch} />;
    case 'sign-in':       return <SignInScreen card={card} state={state} dispatch={dispatch} />;
    case 'sign-up':       return <SignUpScreen card={card} state={state} dispatch={dispatch} />;
    case 'terms':         return <TermsScreen card={card} state={state} dispatch={dispatch} />;
    case 'two-factor':    return <TwoFactorScreen card={card} dispatch={dispatch} />;
    case 'skipped':       return <SkippedScreen card={card} onClose={() => onComplete?.({ mode: 'skipped' })} />;
    case 'success':       return <SuccessScreen card={card} email={state.email} onClose={() => onComplete?.({ mode: 'signed-in', email: state.email })} />;
  }
}

function WelcomeScreen({ card, onContinue }: { card: React.CSSProperties; onContinue: () => void }) {
  return (
    <div style={card}>
      <h2 style={heading}>Welcome to DEX</h2>
      <p style={body}>
        DEX runs fully on your machine. An account is optional and only needed if you want
        cloud backup, cross-device sync, payments, or to publish to the marketplace.
      </p>
      <p style={body}>You can always create one later from Settings -&gt; Account.</p>
      <Button variant="primary" size="lg" onClick={onContinue} fullWidth>Continue</Button>
    </div>
  );
}

function ChooseScreen({ card, dispatch }: { card: React.CSSProperties; dispatch: (ev: FlowEvent) => void }) {
  return (
    <div style={card}>
      <h2 style={heading}>Account</h2>
      <p style={body}>Pick the option that fits you. The recommended path is to skip and decide later.</p>
      <div style={tilesRow}>
        <Button variant="primary" size="lg" fullWidth onClick={() => dispatch({ kind: 'pick-sign-in' })}>I already have an account</Button>
        <Button variant="secondary" size="lg" fullWidth onClick={() => dispatch({ kind: 'pick-sign-up' })}>Create a new account</Button>
        <Button variant="ghost" size="lg" fullWidth onClick={() => dispatch({ kind: 'skip-for-now' })}>Skip for now (recommended)</Button>
      </div>
    </div>
  );
}

function SignInScreen({ card, state, dispatch }: { card: React.CSSProperties; state: FlowState; dispatch: (ev: FlowEvent) => void }) {
  const [email, setEmail] = useState(state.email);
  const [password, setPassword] = useState('');
  return (
    <form
      style={card}
      onSubmit={(e) => { e.preventDefault(); dispatch({ kind: 'submit-sign-in', email, password }); }}
    >
      <h2 style={heading}>Sign in</h2>
      <div style={fieldRow}>
        <FieldLabel>Email</FieldLabel>
        <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!state.errors.email} required />
        {state.errors.email && <p style={errorText}>{state.errors.email}</p>}
      </div>
      <div style={fieldRow}>
        <FieldLabel>Password</FieldLabel>
        <TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!state.errors.password} required />
        {state.errors.password && <p style={errorText}>{state.errors.password}</p>}
      </div>
      <Button type="submit" variant="primary" size="lg" fullWidth>Sign in</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ kind: 'skip-for-now' })}>Skip and use DEX without an account</Button>
    </form>
  );
}

function SignUpScreen({ card, state, dispatch }: { card: React.CSSProperties; state: FlowState; dispatch: (ev: FlowEvent) => void }) {
  const [email, setEmail] = useState(state.email);
  const [displayName, setDisplayName] = useState(state.displayName);
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(state.acceptedTerms);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(state.acceptedPrivacy);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (acceptedTerms && !state.acceptedTerms) dispatch({ kind: 'accept-terms' });
    if (acceptedPrivacy && !state.acceptedPrivacy) dispatch({ kind: 'accept-privacy' });
    // Defer one tick so flow state has the gates marked accepted.
    setTimeout(() => dispatch({ kind: 'submit-sign-up', email, displayName, password }), 0);
  };

  return (
    <form style={card} onSubmit={submit}>
      <h2 style={heading}>Create account</h2>
      <div style={fieldRow}>
        <FieldLabel>Email</FieldLabel>
        <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!state.errors.email} required />
        {state.errors.email && <p style={errorText}>{state.errors.email}</p>}
      </div>
      <div style={fieldRow}>
        <FieldLabel>Display name</FieldLabel>
        <TextInput type="text" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} invalid={!!state.errors.displayName} required />
        {state.errors.displayName && <p style={errorText}>{state.errors.displayName}</p>}
      </div>
      <div style={fieldRow}>
        <FieldLabel>Password (12+ characters)</FieldLabel>
        <TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!state.errors.password} required />
        {state.errors.password && <p style={errorText}>{state.errors.password}</p>}
      </div>
      <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', fontSize: fontSize.xs, color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
        <span>I have read and accept the Terms of Service.</span>
      </label>
      {state.errors.terms && <p style={errorText}>{state.errors.terms}</p>}
      <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', fontSize: fontSize.xs, color: 'var(--color-text-secondary)' }}>
        <input type="checkbox" checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} />
        <span>I have read and accept the Privacy Notice.</span>
      </label>
      {state.errors.privacy && <p style={errorText}>{state.errors.privacy}</p>}
      <Button type="submit" variant="primary" size="lg" fullWidth>Create account</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ kind: 'skip-for-now' })}>Skip for now</Button>
    </form>
  );
}

function TermsScreen({ card, state, dispatch }: { card: React.CSSProperties; state: FlowState; dispatch: (ev: FlowEvent) => void }) {
  return (
    <div style={card}>
      <h2 style={heading}>Before you continue</h2>
      <p style={body}>
        To use the cloud features (sign-in, payments, sync) you must accept the Terms of
        Service and the Privacy Notice. The local app keeps working without these.
      </p>
      <Button variant={state.acceptedTerms ? 'subtle' : 'secondary'} onClick={() => dispatch({ kind: 'accept-terms' })}>
        {state.acceptedTerms ? 'Terms accepted' : 'Accept Terms of Service'}
      </Button>
      <Button variant={state.acceptedPrivacy ? 'subtle' : 'secondary'} onClick={() => dispatch({ kind: 'accept-privacy' })}>
        {state.acceptedPrivacy ? 'Privacy accepted' : 'Accept Privacy Notice'}
      </Button>
      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!state.acceptedTerms || !state.acceptedPrivacy}
        onClick={() => dispatch({ kind: 'pick-sign-in' })}
      >Continue</Button>
    </div>
  );
}

function TwoFactorScreen({ card, dispatch }: { card: React.CSSProperties; dispatch: (ev: FlowEvent) => void }) {
  const [code, setCode] = useState('');
  return (
    <form style={card} onSubmit={(e) => { e.preventDefault(); if (code.length === 6) dispatch({ kind: 'two-factor-passed' }); }}>
      <h2 style={heading}>Two-factor code</h2>
      <p style={body}>Enter the 6-digit code from your authenticator app.</p>
      <TextInput
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        placeholder="123456"
      />
      <Button type="submit" variant="primary" size="lg" fullWidth disabled={code.length !== 6}>Verify</Button>
    </form>
  );
}

function SkippedScreen({ card, onClose }: { card: React.CSSProperties; onClose: () => void }) {
  return (
    <div style={card}>
      <h2 style={heading}>You are good to go</h2>
      <p style={body}>DEX runs fully on your machine. Open Settings -&gt; Account whenever you want to sign in or create an account.</p>
      <Button variant="primary" size="lg" fullWidth onClick={onClose}>Start using DEX</Button>
    </div>
  );
}

function SuccessScreen({ card, email, onClose }: { card: React.CSSProperties; email: string; onClose: () => void }) {
  const greeting = useMemo(() => (email ? `Welcome, ${email}` : 'Welcome'), [email]);
  return (
    <div style={card}>
      <h2 style={heading}>{greeting}</h2>
      <p style={body}>Your account is ready. Cloud sync, payments, and your 100 GB storage are now available from Settings -&gt; Account.</p>
      <Button variant="primary" size="lg" fullWidth onClick={onClose}>Continue</Button>
    </div>
  );
}
