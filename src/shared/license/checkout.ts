// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Checkout URL builder.
 *
 * The renderer never holds the Stripe secret key. The flow:
 *  1. The renderer collects plan + period + seats + email.
 *  2. This module turns that into either:
 *      - a real hosted-checkout URL (when a checkout endpoint is configured), or
 *      - a `mailto:` fallback that emails the publisher so the user still has
 *        a path to complete the purchase even if the cloud function is down.
 *  3. The renderer opens the URL in the system browser via shell:openExternal.
 *
 * Pure module: no DOM, no electron, no network. All inputs in, URL out.
 */

import type { PlanId, BillingPeriod } from './pricing';

/** Email of record for purchase questions / fallback orders. */
export const PUBLISHER_CONTACT_EMAIL = 'onazi75@gmail.com';

export interface CheckoutEndpointConfig {
  /**
   * Base URL of the hosted checkout entrypoint. The cloud function at this
   * URL accepts query params (plan, period, seats, email, return_url) and
   * 302-redirects into a Stripe Checkout session.
   *
   * Empty string / null / undefined disables the hosted flow.
   */
  baseUrl?: string | null;
}

export interface CheckoutRequest {
  planId: PlanId;
  period: BillingPeriod;
  /** Per-seat plans only. Defaults to 1. Clamped to >= 1. */
  seats?: number;
  /** Pre-fills Stripe customer_email. Optional. */
  email?: string;
  /** Optional discount code (e.g. STUDENT50). */
  discountCode?: string;
  /** Locale hint. */
  locale?: string;
  /** Return URL after success / cancel. */
  returnUrl?: string;
}

export type CheckoutMode = 'hosted' | 'contact';

export interface CheckoutPlan {
  /** 'hosted' if a real checkout URL was built, 'contact' if mailto fallback. */
  mode: CheckoutMode;
  /** URL ready to open with shell:openExternal. */
  url: string;
  /** Short reason explaining why this mode was chosen (UI hint). */
  reason: string;
}

/** Plans where seats > 1 makes sense. */
export function isPerSeatPlan(planId: PlanId): boolean {
  return planId === 'studio';
}

/** Clamp seats to a sensible range based on plan. */
export function normalizeSeats(planId: PlanId, requested: number | undefined): number {
  const n = Math.floor(requested ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (isPerSeatPlan(planId)) {
    // Keep it sane; large bulk goes through the volume / sales contact flow.
    if (n > 500) return 500;
    return n;
  }
  return 1;
}

function encode(params: Record<string, string | number | undefined | null>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

/**
 * Build a checkout URL from a request + endpoint config. Always returns a
 * non-empty URL the caller can hand to shell:openExternal -- if the hosted
 * endpoint is not configured, falls back to a structured mailto: link.
 */
export function buildCheckoutUrl(req: CheckoutRequest, cfg: CheckoutEndpointConfig = {}): CheckoutPlan {
  const seats = normalizeSeats(req.planId, req.seats);
  const base = (cfg.baseUrl ?? '').trim();

  if (base.length > 0 && /^https?:\/\//i.test(base)) {
    const qs = encode({
      plan: req.planId,
      period: req.period,
      seats,
      email: req.email,
      discount: req.discountCode,
      locale: req.locale,
      return_url: req.returnUrl,
    });
    const sep = base.includes('?') ? '&' : '?';
    return {
      mode: 'hosted',
      url: `${base}${qs ? sep + qs : ''}`,
      reason: 'opening hosted checkout',
    };
  }

  // Fallback: structured mailto so the user still has a path to buy.
  const subject = `DEX purchase request: ${req.planId} (${req.period})${seats > 1 ? ` x ${seats}` : ''}`;
  const bodyLines = [
    'Hi,',
    '',
    `I would like to purchase a DEX subscription.`,
    `- Plan: ${req.planId}`,
    `- Billing: ${req.period}`,
    `- Seats: ${seats}`,
    req.email ? `- Email on file: ${req.email}` : '',
    req.discountCode ? `- Discount code: ${req.discountCode}` : '',
    '',
    'Please send a payment link.',
    '',
    'Thanks.',
  ].filter(Boolean);
  const body = bodyLines.join('\n');
  const url = `mailto:${PUBLISHER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return {
    mode: 'contact',
    url,
    reason: 'no hosted checkout endpoint configured; using publisher contact email',
  };
}

/**
 * Read the checkout endpoint config from the renderer's global injection
 * point. Returns an empty config (so the mailto fallback is used) when no
 * endpoint is configured.
 *
 * Two known sources, in order:
 *   1. window.dexConfig.checkoutBaseUrl  (runtime injection by main process)
 *   2. window.DEX_CHECKOUT_BASE_URL      (build-time / dev override)
 */
export function readCheckoutConfigFromGlobal(globalObj: any): CheckoutEndpointConfig {
  if (!globalObj || typeof globalObj !== 'object') return {};
  const fromConfig = globalObj?.dexConfig?.checkoutBaseUrl;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return { baseUrl: fromConfig };
  const fromDirect = globalObj?.DEX_CHECKOUT_BASE_URL;
  if (typeof fromDirect === 'string' && fromDirect.length > 0) return { baseUrl: fromDirect };
  return {};
}
