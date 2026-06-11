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
import { PlanComparePanel } from './PlanComparePanel';
import { PaymentMethodPicker } from './PaymentMethodPicker';
import { quotaFor, formatBytes } from '../../../shared/cloud/quota';
import type { PlanId, BillingPeriod } from '../../../shared/license/pricing';
import { buildCheckoutUrl, readCheckoutConfigFromGlobal } from '../../../shared/license/checkout';

const STORAGE_KEY = 'dex.account.v1';

async function openExternalUrl(url: string): Promise<boolean> {
  try {
    const w: any = typeof window !== 'undefined' ? window : null;
    if (w?.electron?.invoke) {
      await w.electron.invoke('shell:openExternal', url);
      return true;
    }
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
  } catch {
    /* INTENTIONAL FALLBACK: opening externally may be blocked. UI shows the URL for manual copy. */
  }
  return false;
}

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

// ALL-FREE POLICY: payment and plan-compare surfaces are hidden, not removed.
// Flip to true to restore subscription management UI.
const PAYMENTS_ENABLED: boolean = false;

export interface AccountSettingsCardProps {
  /** Override storage source for tests. */
  initialAccount?: CardAccount | null;
  /** Optional callback to open the billing portal. If not supplied, an inline panel is shown. */
  onManageBilling?: (account: CardAccount) => void;
  /** Optional callback to open the plan-compare panel. If not supplied, an inline panel is shown. */
  onComparePlans?: (account: CardAccount) => void;
}

export function AccountSettingsCard({ initialAccount, onManageBilling, onComparePlans }: AccountSettingsCardProps = {}) {
  const [account, setAccount] = useState<CardAccount | null>(() => initialAccount ?? readAccount());
  const [showFlow, setShowFlow] = useState(false);
  const [panel, setPanel] = useState<'none' | 'billing' | 'compare' | 'pay'>('none');
  const [pending, setPending] = useState<{ planId: PlanId; period: BillingPeriod; seats: number } | null>(null);

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

  const handleManageBilling = useCallback(() => {
    if (!account) return;
    if (onManageBilling) onManageBilling(account);
    else setPanel('billing');
  }, [account, onManageBilling]);

  const handleCompare = useCallback(() => {
    if (!account) return;
    if (onComparePlans) onComparePlans(account);
    else setPanel('compare');
  }, [account, onComparePlans]);

  if (showFlow || !account) {
    return showFlow ? (
      <AccountAuthFlow showWelcome={false} onComplete={handleComplete} />
    ) : (
      <SignedOutView onSignIn={() => setShowFlow(true)} />
    );
  }

  return (
    <SignedInView
      account={account}
      onSignOut={signOut}
      onManageBilling={handleManageBilling}
      onCompare={handleCompare}
      panel={panel}
      pending={pending}
      onChoosePlan={(planId, period, seats) => { setPending({ planId, period, seats }); setPanel('pay'); }}
      onClosePanel={() => { setPanel('none'); setPending(null); }}
    />
  );
}

function SignedOutView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={cardStyle}>
      <h3 style={cardHeading}>You are using DEX without an account</h3>
      <p style={bodyText}>
        That is totally fine. DEX runs fully on your machine. Sign in or create a free
        account when you want cloud backup, cross-device sync, or to publish plugins.
      </p>
      <Button variant="primary" size="md" onClick={onSignIn}>Sign in or create account</Button>
    </div>
  );
}

function SignedInView({ account, onSignOut, onManageBilling, onCompare, panel, pending, onChoosePlan, onClosePanel }: {
  account: CardAccount;
  onSignOut: () => void;
  onManageBilling: () => void;
  onCompare: () => void;
  panel: 'none' | 'billing' | 'compare' | 'pay';
  pending: { planId: PlanId; period: BillingPeriod; seats: number } | null;
  onChoosePlan: (planId: PlanId, period: BillingPeriod, seats: number) => void;
  onClosePanel: () => void;
}) {
  const usedBytes = 0;
  const snap = quotaFor({ planId: account.plan, usedBytes });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={cardStyle}>
        <h3 style={cardHeading}>{account.displayName ?? account.email}</h3>
        <p style={bodyText}>Signed in as {account.email}</p>
        <p style={bodyText}>
          Plan: <strong style={{ color: 'var(--color-text-primary)' }}>{PAYMENTS_ENABLED ? prettyPlan(account.plan) : 'Free — all features included'}</strong>
        </p>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {PAYMENTS_ENABLED && <Button variant="secondary" size="sm" onClick={onManageBilling}>Manage subscription</Button>}
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
      {PAYMENTS_ENABLED && account.plan === 'free-viewer' && (
        <UpgradePrompt currentPlan={account.plan} onCompare={onCompare} />
      )}
      {PAYMENTS_ENABLED && panel === 'billing' && (
        <BillingPanel account={account} onClose={onClosePanel} />
      )}
      {PAYMENTS_ENABLED && panel === 'compare' && (
        <PlanComparePanel
          currentPlan={account.plan}
          onClose={onClosePanel}
          onChoose={(planId, period, seats) => { onChoosePlan(planId, period, seats); }}
        />
      )}
      {PAYMENTS_ENABLED && panel === 'pay' && pending && (
        <PaymentMethodPicker
          planId={pending.planId}
          period={pending.period}
          seats={pending.seats}
          email={account.email}
          onClose={onClosePanel}
          onContinue={(method) => {
            if (method.url) { void openExternalUrl(method.url); }
            onClosePanel();
          }}
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

function BillingPanel({ account, onClose }: { account: CardAccount; onClose: () => void }) {
  const cfg = readCheckoutConfigFromGlobal(typeof window !== 'undefined' ? window : null);
  const hasEndpoint = typeof cfg.baseUrl === 'string' && cfg.baseUrl.length > 0;
  const handleManage = useCallback(async () => {
    if (hasEndpoint && cfg.baseUrl) {
      // Append a hint so the cloud function can route to the customer portal.
      const sep = cfg.baseUrl.includes('?') ? '&' : '?';
      await openExternalUrl(`${cfg.baseUrl}${sep}portal=1&email=${encodeURIComponent(account.email)}`);
    } else {
      const fallback = buildCheckoutUrl({ planId: account.plan, period: 'yearly', email: account.email }, cfg);
      await openExternalUrl(fallback.url);
    }
  }, [hasEndpoint, account.email, account.plan, cfg]);
  return (
    <div style={cardStyle}>
      <h3 style={cardHeading}>Manage subscription</h3>
      <p style={bodyText}>
        {hasEndpoint
          ? 'The customer portal opens in your default browser. You can update payment methods, change plan, or cancel from there.'
          : 'No hosted checkout is configured for this build. The button below opens an email to the publisher with your plan request -- you can buy from there.'}
      </p>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm" onClick={handleManage}>
          {hasEndpoint ? 'Open billing portal' : 'Email the publisher'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
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
