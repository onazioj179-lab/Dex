// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PaymentMethodPicker.
 *
 * Calm, restrained "how do you want to pay?" panel. Shown after the user
 * picks a plan in PlanComparePanel. Lists every method returned by
 * `buildPaymentPlan`: card (when configured), Bitcoin, Ethereum, and
 * always email-the-publisher as a guaranteed fallback. No animations, no
 * gradients, no emojis -- just a clear total, the methods, and one
 * `Continue` button per method.
 *
 * For crypto methods the panel shows the receive address as monospace text
 * with a one-click Copy button, plus a `Open in wallet` button that uses
 * the standard `bitcoin:` / `ethereum:` URI so a wallet app on the host
 * machine can pre-fill the amount.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import { space, radius, fontSize } from '../../styles/tokens';
import {
  buildPaymentPlan,
  readPaymentConfigFromGlobal,
  type PaymentEndpointConfig,
  type PaymentMethod,
  type PaymentPlan,
} from '../../../shared/license/payment';
import type { PlanId, BillingPeriod } from '../../../shared/license/pricing';
import { formatPrice } from '../../../shared/license/pricing';

export interface PaymentMethodPickerProps {
  planId: PlanId;
  period: BillingPeriod;
  seats?: number;
  email?: string;
  /** Override the runtime config (useful for tests). */
  config?: PaymentEndpointConfig;
  /** Called when the user clicks Continue on a specific method. */
  onContinue: (method: PaymentMethod, plan: PaymentPlan) => void;
  /** Called when the user dismisses the picker. */
  onClose: () => void;
}

export function PaymentMethodPicker(props: PaymentMethodPickerProps) {
  const cfg = useMemo<PaymentEndpointConfig>(() => {
    if (props.config) return props.config;
    return readPaymentConfigFromGlobal(typeof window !== 'undefined' ? window : null);
  }, [props.config]);

  const plan = useMemo<PaymentPlan>(() => buildPaymentPlan(
    { planId: props.planId, period: props.period, seats: props.seats, email: props.email },
    cfg,
  ), [props.planId, props.period, props.seats, props.email, cfg]);

  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleContinue = useCallback((m: PaymentMethod) => { props.onContinue(m, plan); }, [plan, props]);

  return (
    <div role="dialog" aria-label="Choose payment method" style={panelStyle}>
      <header style={headerStyle}>
        <h3 style={titleStyle}>Choose how to pay</h3>
        <p style={subtleText}>
          Total <strong style={{ color: 'var(--color-text-primary)' }}>{formatPrice(plan.totalCents)}</strong>
          {' '}for <strong style={{ color: 'var(--color-text-primary)' }}>{props.planId}</strong>
          {' '}({props.period}{props.planId === 'studio' && props.seats ? `, ${props.seats} seats` : ''}).
        </p>
        <p style={subtleText}>Memo <code style={memoCode}>{plan.memo}</code> is included with each method so the publisher can match your payment.</p>
      </header>

      <div style={listStyle}>
        {plan.methods.map(m => (
          <MethodRow key={m.id} method={m} onContinue={handleContinue} />
        ))}
      </div>

      <footer style={footerStyle}>
        <Button variant="ghost" size="sm" onClick={props.onClose}>Cancel</Button>
      </footer>
    </div>
  );
}

function MethodRow({ method, onContinue }: { method: PaymentMethod; onContinue: (m: PaymentMethod) => void }) {
  const [copied, setCopied] = useState<'address' | 'amount' | 'memo' | null>(null);
  const copy = useCallback(async (kind: 'address' | 'amount' | 'memo', value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1500);
      }
    } catch {
      /* INTENTIONAL FALLBACK: clipboard may be blocked; user can long-press to copy manually. */
    }
  }, []);

  const disabled = !method.available;
  return (
    <div data-testid={`method-${method.id}`} style={{ ...rowStyle, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'baseline' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
          <span style={{ fontSize: fontSize.base, fontWeight: 600 }}>{method.label}</span>
          <span style={subtleText}>{disabled ? (method.unavailableReason ?? method.helper) : method.helper}</span>
        </div>
        {!disabled && (
          <Button variant={method.id === 'email' ? 'secondary' : 'primary'} size="sm" onClick={() => onContinue(method)}>
            {method.id === 'card' ? 'Open checkout' : method.id === 'email' ? 'Compose email' : 'Open in wallet'}
          </Button>
        )}
      </div>

      {method.address && (
        <div style={cryptoBlock}>
          <div style={cryptoRow}>
            <span style={cryptoLabel}>Address</span>
            <code style={monoText} data-testid={`address-${method.id}`}>{method.address}</code>
            <Button variant="ghost" size="sm" onClick={() => copy('address', method.address!)}>
              {copied === 'address' ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {method.amountDisplay && (
            <div style={cryptoRow}>
              <span style={cryptoLabel}>Amount</span>
              <code style={monoText} data-testid={`amount-${method.id}`}>{method.amountDisplay}</code>
              <Button variant="ghost" size="sm" onClick={() => copy('amount', method.amountDisplay!)}>
                {copied === 'amount' ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          <div style={cryptoRow}>
            <span style={cryptoLabel}>Memo</span>
            <code style={monoText}>{method.memo}</code>
            <Button variant="ghost" size="sm" onClick={() => copy('memo', method.memo)}>
              {copied === 'memo' ? 'Copied' : 'Copy'}
            </Button>
          </div>
          {method.priceUnknown && (
            <p style={{ ...subtleText, margin: 0 }}>
              No live exchange rate is available in this build. Confirm the USD amount with the publisher before sending, or use email to request a fixed quote.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: radius.lg,
  padding: space[5],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
};
const headerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: space[2] };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: fontSize.lg, fontWeight: 600 };
const subtleText: React.CSSProperties = { margin: 0, fontSize: fontSize.sm, color: 'var(--color-text-secondary, rgba(255,255,255,0.72))', lineHeight: 1.5 };
const memoCode: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  background: 'var(--color-bg-inset, #101012)',
  padding: '2px 6px',
  borderRadius: radius.sm,
  fontSize: fontSize.xs,
};
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: space[3] };
const rowStyle: React.CSSProperties = {
  background: 'var(--color-bg-inset, #101012)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: radius.md,
  padding: space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
};
const cryptoBlock: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: space[2] };
const cryptoRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' };
const cryptoLabel: React.CSSProperties = { fontSize: fontSize.xs, color: 'var(--color-text-tertiary, rgba(255,255,255,0.55))', minWidth: 64 };
const monoText: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: fontSize.xs,
  background: 'var(--color-bg, #0A0A0B)',
  padding: '4px var(--space-2)',
  borderRadius: radius.sm,
  wordBreak: 'break-all',
  flex: 1,
  minWidth: 0,
};
const footerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: space[2] };
