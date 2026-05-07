// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Revenue plumbing — wave I.
 *
 * Soft paywall gating, plan-picker presentation, trial countdown
 * coloring, per-seat math for Studio, promo-code validation, receipts
 * normalisation, and the cancel-flow retention ladder. Pure: no DOM,
 * no Stripe SDK, no IPC. Reuses the canonical PLANS from license/pricing.
 */

// DEX v3.8.9 wave I - revenue plumbing

import { PLANS, getPlan, type PlanId, type Plan, type BillingPeriod } from '../license/pricing';

// -------- soft paywall ---------------------------------------------------

/**
 * Capability a feature gate asks about. Mirrors PlanCapabilities flags
 * but stays a string union so new gates can be added without touching
 * the canonical pricing types.
 */
export type GatedCapability =
  | 'commercialUse' | 'liveCollab' | 'prioritySupport' | 'adminConsole';

export interface FeatureGateInput {
  /** What the user is currently on. */
  currentPlanId: PlanId;
  /** What the feature requires. */
  capability: GatedCapability;
  /** True while the trial is active — trial users get every gate. */
  inTrial: boolean;
}

export interface FeatureGateResult {
  /** Allow the action. */
  allow: boolean;
  /** Lowest plan that unlocks the capability, if blocked. */
  upgradeTo: PlanId | null;
  /** User-facing reason. */
  reason: string;
}

/**
 * Decide whether the user may use a gated feature. Soft paywall —
 * the caller is expected to either run the action (allow=true) or show
 * an UpgradePrompt (allow=false, upgradeTo populated). Never throws.
 */
export function evaluateFeatureGate(input: FeatureGateInput): FeatureGateResult {
  if (input.inTrial) {
    return { allow: true, upgradeTo: null, reason: 'Trial includes every feature.' };
  }
  const current = getPlan(input.currentPlanId);
  if (current.capabilities[input.capability]) {
    return { allow: true, upgradeTo: null, reason: 'Included in your plan.' };
  }
  // Find the cheapest paid plan that has this capability.
  const candidates = PLANS.filter(
    (p) => p.id !== 'free-viewer' && p.capabilities[input.capability]
  );
  candidates.sort((a, b) => (a.prices.monthly?.cents ?? Infinity) - (b.prices.monthly?.cents ?? Infinity));
  const upgradeTo = candidates[0]?.id ?? null;
  return {
    allow: false,
    upgradeTo,
    reason: upgradeTo
      ? `Available on ${getPlan(upgradeTo).name} and above.`
      : 'Not available on your plan.',
  };
}

// -------- plan picker presentation --------------------------------------

export type PickerBadge = 'most-popular' | 'best-value' | 'free' | null;

export interface PickerCard {
  plan: Plan;
  /** Label such as "$20" or "Free" — for the headline price. */
  headlinePrice: string;
  /** Suffix such as "/ month" or "" for free / lifetime. */
  headlineSuffix: string;
  /** Live "Save $X / yr" string when both monthly + yearly exist. */
  yearlySavingsLabel: string | null;
  badge: PickerBadge;
  /** True when this card matches the user's current plan. */
  current: boolean;
}

/**
 * Build the data for the plan-picker grid. The free viewer is always
 * first; "Most popular" badge is fixed to the Pro tier; "Best value"
 * goes to the plan with the highest monthly→yearly savings.
 */
export function buildPlanPicker(
  currentPlanId: PlanId,
  period: 'monthly' | 'yearly' = 'monthly'
): PickerCard[] {
  const cards: PickerCard[] = [];
  // Best-value = highest yearly savings.
  let bestValueId: PlanId | null = null;
  let bestSavings = 0;
  for (const p of PLANS) {
    const m = p.prices.monthly?.cents;
    const y = p.prices.yearly?.cents;
    if (!m || !y) continue;
    const annual = m * 12;
    const saved = annual - y;
    if (saved > bestSavings) {
      bestSavings = saved;
      bestValueId = p.id;
    }
  }
  for (const plan of PLANS) {
    const monthly = plan.prices.monthly?.cents;
    const yearly = plan.prices.yearly?.cents;
    const which = period === 'yearly' && yearly !== undefined ? yearly : monthly;
    let headlinePrice: string;
    let headlineSuffix: string;
    if (which === undefined) {
      headlinePrice = '—';
      headlineSuffix = '';
    } else if (which === 0) {
      headlinePrice = 'Free';
      headlineSuffix = '';
    } else {
      headlinePrice = `$${(which / 100).toFixed(which % 100 === 0 ? 0 : 2)}`;
      headlineSuffix = period === 'yearly' ? ' / year' : ' / month';
      if (plan.prices.monthly?.unit === 'seat' || plan.prices.yearly?.unit === 'seat') {
        headlineSuffix = period === 'yearly' ? ' / seat / year' : ' / seat / month';
      }
    }
    let savingsLabel: string | null = null;
    if (monthly && yearly && monthly > 0) {
      const saved = monthly * 12 - yearly;
      if (saved > 0) savingsLabel = `Save $${(saved / 100).toFixed(0)} / yr`;
    }
    let badge: PickerBadge = null;
    if (plan.id === 'free-viewer') badge = 'free';
    else if (plan.id === 'pro') badge = 'most-popular';
    else if (plan.id === bestValueId) badge = 'best-value';

    cards.push({
      plan,
      headlinePrice,
      headlineSuffix,
      yearlySavingsLabel: savingsLabel,
      badge,
      current: plan.id === currentPlanId,
    });
  }
  return cards;
}

// -------- trial countdown coloring --------------------------------------

export type CountdownTier = 'fresh' | 'midway' | 'soon' | 'expired';

export interface CountdownState {
  daysRemaining: number;
  tier: CountdownTier;
  label: string;
}

/** Map remaining days → color tier (consumer paints). */
export function trialCountdown(daysRemaining: number): CountdownState {
  if (daysRemaining <= 0) {
    return { daysRemaining: 0, tier: 'expired', label: 'Trial ended' };
  }
  if (daysRemaining <= 3) {
    return { daysRemaining, tier: 'soon', label: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left` };
  }
  if (daysRemaining <= 14) {
    return { daysRemaining, tier: 'midway', label: `${daysRemaining} days left` };
  }
  return { daysRemaining, tier: 'fresh', label: `${daysRemaining} days left` };
}

// -------- per-seat Studio calculator -----------------------------------

export interface SeatQuote {
  seats: number;
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  /** Effective per-seat monthly when paying yearly. */
  effectivePerSeatMonthlyCents: number;
}

export function quoteSeats(seats: number): SeatQuote {
  const studio = getPlan('studio');
  const m = studio.prices.monthly?.cents ?? 0;
  const y = studio.prices.yearly?.cents ?? 0;
  const cleanSeats = Math.max(1, Math.floor(seats));
  return {
    seats: cleanSeats,
    monthlyTotalCents: m * cleanSeats,
    yearlyTotalCents: y * cleanSeats,
    effectivePerSeatMonthlyCents: y > 0 ? Math.round(y / 12) : 0,
  };
}

// -------- promo code validation ----------------------------------------

export type PromoIssue = 'empty' | 'too-short' | 'too-long' | 'bad-chars' | 'ok';

/**
 * Validate the *format* of a promo code before the network call.
 * Server still owns final validity. Allowed: A–Z, 0–9, dashes; 4–32 chars.
 */
export function validatePromoFormat(code: string): { ok: boolean; issue: PromoIssue; normalised: string } {
  const raw = (code ?? '').trim();
  if (raw === '') return { ok: false, issue: 'empty', normalised: '' };
  const upper = raw.toUpperCase();
  if (upper.length < 4) return { ok: false, issue: 'too-short', normalised: upper };
  if (upper.length > 32) return { ok: false, issue: 'too-long', normalised: upper };
  if (!/^[A-Z0-9-]+$/.test(upper)) return { ok: false, issue: 'bad-chars', normalised: upper };
  return { ok: true, issue: 'ok', normalised: upper };
}

// -------- receipts normalisation ---------------------------------------

export interface RawReceipt {
  id: string;
  /** Unix ms. */
  paidAt: number;
  amountCents: number;
  currency: string;
  planId: PlanId;
  period: BillingPeriod;
  /** Stripe-side id, opaque. */
  stripeChargeId?: string;
}

export interface NormalisedReceipt extends RawReceipt {
  /** Human label like "Apr 12, 2026". */
  paidOnLabel: string;
  /** Human price like "$20" or "$179". */
  amountLabel: string;
  /** Human plan like "DEX Personal — monthly". */
  planLabel: string;
}

export function normaliseReceipt(raw: RawReceipt, locale: string = 'en-US'): NormalisedReceipt {
  const date = new Date(raw.paidAt);
  const paidOnLabel = date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const dollars = raw.amountCents / 100;
  const amountLabel = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: raw.currency,
    minimumFractionDigits: raw.amountCents % 100 === 0 ? 0 : 2,
  }).format(dollars);
  const plan = PLANS.find((p) => p.id === raw.planId);
  const planLabel = `${plan?.name ?? raw.planId} — ${raw.period}`;
  return { ...raw, paidOnLabel, amountLabel, planLabel };
}

/** Sort newest first. */
export function sortReceipts(receipts: readonly RawReceipt[]): RawReceipt[] {
  return [...receipts].sort((a, b) => b.paidAt - a.paidAt);
}

// -------- cancel flow / retention ladder -------------------------------

export type RetentionStep = 'pause' | 'discount' | 'cancel';

export interface RetentionOffer {
  step: RetentionStep;
  title: string;
  body: string;
  /** Action id the renderer maps to a handler. */
  actionId: string;
}

/**
 * The ladder shown when a user clicks "Cancel subscription". No dark
 * patterns: each step is a single screen with a clear "Continue
 * cancelling" button alongside the offer.
 */
export function retentionLadder(): RetentionOffer[] {
  return [
    {
      step: 'pause',
      title: 'Pause for up to 3 months instead?',
      body: 'Keep your data, settings, and plans. We will not bill you while paused.',
      actionId: 'subscription.pause',
    },
    {
      step: 'discount',
      title: 'Stay with 30% off for 3 months?',
      body: 'Same plan, same features, lower price.',
      actionId: 'subscription.discount30',
    },
    {
      step: 'cancel',
      title: 'Cancel subscription',
      body: 'You keep read-only access to all your work, forever.',
      actionId: 'subscription.cancel',
    },
  ];
}
