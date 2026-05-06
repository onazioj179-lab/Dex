// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Stripe Checkout integration
 * -----------------------------------------------------------------------------
 * Maps DEX plans -> Stripe price IDs and exposes the small surface the
 * renderer + cloud function need:
 *
 *   - `getStripePriceId(planId, period)` -> string | null
 *   - `buildCheckoutPayload({...})`      -> Stripe Checkout Session params
 *   - `verifyWebhookSignature(...)`      -> boolean (HMAC, constant-time)
 *
 * Real Stripe API calls happen server-side only (an Electron-side Stripe
 * secret would be a credential leak; the public source repo would expose it
 * to anyone). The renderer only ever opens the returned `checkoutUrl` in
 * the system browser; the secret key never touches the client.
 *
 * INTENTIONAL STUB: actual `stripe-node` SDK call is wrapped behind the
 * `StripeClient` interface so unit tests pass without network and so the
 * cloud function is the only place the secret key lives. To go live, set
 * STRIPE_SECRET_KEY in the cloud function env and pass a real client to
 * `createCheckoutSession`.
 */

// DEX v3.8.7 - Stripe payment integration

import { constantTimeEquals } from '../security/abusePrevention';
import type { PlanId, BillingPeriod } from '../license/pricing';

/**
 * Public Stripe Price IDs. These look like 'price_1ABCxyz...'. The values
 * below are placeholders that MUST be replaced with the real IDs created
 * in the Stripe dashboard before going live. Until then `getStripePriceId`
 * returns null and the checkout dialog shows "Coming soon".
 *
 * Storing IDs in code (not the secret key) is fine; they are public.
 */
export const STRIPE_PRICE_IDS: Record<PlanId, Partial<Record<BillingPeriod, string>>> = {
  'free-viewer': {},
  personal: {
    monthly: '',  // set in production: 'price_personal_monthly'
    yearly: '',   // set in production: 'price_personal_yearly'
    lifetime: '', // set in production: 'price_personal_lifetime'
  },
  family: {
    yearly: '',
    lifetime: '',
  },
  pro: {
    monthly: '',
    yearly: '',
    lifetime: '',
  },
  studio: {
    monthly: '',
    yearly: '',
  },
};

export function getStripePriceId(planId: PlanId, period: BillingPeriod): string | null {
  const id = STRIPE_PRICE_IDS[planId]?.[period];
  return id && id.length > 0 ? id : null;
}

export interface CheckoutRequest {
  accountId: string;
  email: string;
  planId: PlanId;
  period: BillingPeriod;
  /** Quantity for per-seat plans (Studio). Defaults to 1. */
  quantity?: number;
  /** Where Stripe sends the user after success / cancel. */
  successUrl: string;
  cancelUrl: string;
  /** Optional discount code (student / non-profit / oss). */
  discountCode?: string;
  /** Locale for Stripe-hosted checkout. */
  locale?: string;
}

export interface CheckoutSessionParams {
  mode: 'subscription' | 'payment';
  customer_email: string;
  line_items: Array<{ price: string; quantity: number }>;
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  allow_promotion_codes: boolean;
  metadata: Record<string, string>;
  locale?: string;
}

/** Build the Stripe Checkout Session params. Pure function. */
export function buildCheckoutPayload(req: CheckoutRequest): CheckoutSessionParams {
  const priceId = getStripePriceId(req.planId, req.period);
  if (!priceId) throw new Error(`no Stripe price configured for ${req.planId}/${req.period}`);
  const isLifetime = req.period === 'lifetime';
  const params: CheckoutSessionParams = {
    mode: isLifetime ? 'payment' : 'subscription',
    customer_email: req.email,
    line_items: [{ price: priceId, quantity: Math.max(1, req.quantity ?? 1) }],
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    client_reference_id: req.accountId,
    allow_promotion_codes: true,
    metadata: {
      planId: req.planId,
      period: req.period,
      accountId: req.accountId,
      ...(req.discountCode ? { discountCode: req.discountCode } : {}),
    },
  };
  if (req.locale) params.locale = req.locale;
  return params;
}

/**
 * Minimal Stripe client interface so tests + cloud both wire to the same
 * shape. Real impl: `new Stripe(secret).checkout.sessions.create(params)`.
 */
export interface StripeClient {
  createCheckoutSession: (params: CheckoutSessionParams) => Promise<{ id: string; url: string }>;
}

export interface CheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

/**
 * Server-side: create a real Stripe checkout session. The cloud function
 * is the only place that holds the Stripe secret key.
 */
export async function createCheckoutSession(
  client: StripeClient,
  req: CheckoutRequest,
): Promise<CheckoutResult> {
  const params = buildCheckoutPayload(req);
  const session = await client.createCheckoutSession(params);
  return { sessionId: session.id, checkoutUrl: session.url };
}

/**
 * Verify a Stripe webhook signature using constant-time comparison. We
 * intentionally do not compute HMAC here because that requires Node's
 * `crypto` (not available in renderer test env). The cloud function
 * computes the expected signature and passes both into this function.
 */
export function verifyWebhookSignature(received: string, expected: string): boolean {
  return constantTimeEquals(received || '', expected || '');
}

/** Detect if pricing IDs have been configured for go-live. */
export function isStripeConfigured(): boolean {
  for (const planMap of Object.values(STRIPE_PRICE_IDS)) {
    for (const id of Object.values(planMap)) {
      if (typeof id === 'string' && id.length > 0) return true;
    }
  }
  return false;
}
