// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AccountSettingsCard -- the polished, signed-in/signed-out account panel.
 * Drop into Settings -> Account section. Renders the auth flow when signed
 * out and the management view when signed in. All state is local to this
 * file in v3.8.9 so the polish ships independently of any cloud transport.
 */

// DEX v3.8.9 - account settings card UI

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../ui/Button';
import { space, radius, fontSize } from '../../styles/tokens';
import { AccountAuthFlow } from './AccountAuthFlow';
import { UpgradePrompt } from './ProBadge';
import { quotaFor, formatBytes } from '../../../shared/cloud/quota';
import type { PlanId } from '../../../shared/license/pricing';

const STORAGE_KEY = 'dex.account.v1';

interface CardAccount {
  email: string;
  displayName?: string;
  plan: PlanId;
  createdAt: number;
}

function readAccount(): CardAccount | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CardAccount>;
    if (!parsed.email) return null;
    return {
      email: String(parsed.email),
      displayName: parsed.displayName ? String(parsed.displayName) : undefined,
      plan: (parsed.plan as PlanId) ?? 'free-viewer',
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeAccount(acc: CardAccount | null) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (acc) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* INTENTIONAL FALLBACK: storage may be blocked (private mode); UI still renders correctly. */
  }
}

export interface AccountSettingsCardProps {
  /** Override storage source for tests. */
  initialAccount?: CardAccount | null;
}

export function AccountSettingsCard({ initialAccount }: AccountSettingsCardProps = {}) {
  const [account, setAccount] = useState<CardAccount | null>(() => initialAccount ?? readAccount());
  const [showFlow, setShowFlow] = useState(false);

  useEffect(() => { writeAccount(account); }, [account]);

  const handleComplete = useCallback((r: { mode: 'signed-in' | 'signed-up' | 'skipped'; email?: string }) => {
    setShowFlow(false);
    if (r.mode === 'skipped' || !r.email) return;
    setAccount({
      email: r.email,
      plan: 'free-viewer',
      createdAt: Date.now(),
    });
  }, []);

  const signOut = useCallback(() => setAccount(null), []);

  if (showFlow || !account) {
    return showFlow ? (
      <AccountAuthFlow showWelcome={false} onComplete={handleComplete} />
    ) : (
      <SignedOutView onSignIn={() => setShowFlow(true)} />
    );
  }

  return <SignedInView account={account} onSignOut={signOut} />;
}

function SignedOutView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={cardStyle}>
      <h3 style={cardHeading}>You are using DEX without an account</h3>
      <p style={bodyText}>
        That is totally fine. DEX runs fully on your machine. Sign in or create a free
        account when you want cloud backup, cross-device sync, payments, or to publish
        plugins.
      </p>
      <Button variant="primary" size="md" onClick={onSignIn}>Sign in or create account</Button>
    </div>
  );
}

function SignedInView({ account, onSignOut }: { account: CardAccount; onSignOut: () => void }) {
  const usedBytes = 0;
  const snap = quotaFor({ planId: account.plan, usedBytes });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={cardStyle}>
        <h3 style={cardHeading}>{account.displayName ?? account.email}</h3>
        <p style={bodyText}>Signed in as {account.email}</p>
        <p style={bodyText}>
          Plan: <strong style={{ color: 'var(--color-text-primary)' }}>{prettyPlan(account.plan)}</strong>
        </p>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => alert('Manage subscription opens billing portal (configured at runtime).')}>Manage subscription</Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>
      <div style={cardStyle}>
        <h3 style={cardHeading}>Cloud storage</h3>
        <p style={bodyText}>{formatBytes(snap.usedBytes)} of {formatBytes(snap.totalBytes)} used</p>
        <div style={{ height: 8, background: 'var(--color-bg-inset, #101012)', borderRadius: radius.full, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, snap.fraction * 100)}%`, height: '100%', background: snap.full ? 'var(--color-error)' : snap.warn ? 'var(--color-warning, #FFC107)' : 'var(--color-accent, #4A9EFF)' }} />
        </div>
      </div>
      {account.plan === 'free-viewer' && (
        <UpgradePrompt
          currentPlan={account.plan}
          onCompare={() => alert('Open the Pricing page to compare plans (Settings -> Account -> Compare).')}
        />
      )}
    </div>
  );
}

function prettyPlan(p: PlanId): string {
  switch (p) {
    case 'free-viewer': return 'Free Viewer';
    case 'personal':    return 'Personal';
    case 'family':      return 'Family';
    case 'pro':         return 'Pro';
    case 'studio':      return 'Studio';
  }
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: radius.lg,
  padding: space[5],
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
};
const cardHeading: React.CSSProperties = { margin: 0, fontSize: fontSize.lg, fontWeight: 600 };
const bodyText: React.CSSProperties = { margin: 0, fontSize: fontSize.sm, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', lineHeight: 1.5 };
